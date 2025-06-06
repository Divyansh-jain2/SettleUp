'use server';

import { neon } from '@neondatabase/serverless';
import { clerkClient } from '@clerk/nextjs/server';

// Assumption: DATABASE_URL is configured in your environment variables.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}
const sql = neon(process.env.DATABASE_URL);

// --- INTERFACES ---

export interface RequestData {
  amount: number;
  description: string;
  groupId: string;
  createdBy: string;
  createdByEmail: string;
  requestTo: { id: string; email: string };
}

export interface Request {
  id: string;
  amount: number;
  description: string;
  created_by: string;
  created_by_email: string;
  request_to: { id: string; email: string };
  created_at: string;
  status: 'pending' | 'settled';
  settled_at?: string;
  settled_by?: string;
}

export interface UserBalance {
  userId: string;
  userEmail: string;
  balance: number; // Positive: owed money (creditor), Negative: owes money (debtor)
}

export interface SettlementTransaction {
  from: { id: string; email: string };
  to: { id: string; email: string };
  amount: number;
}


// --- DATABASE FUNCTIONS ---

/**
 * Inserts a new request record into the "requests" table using separate columns
 * for request_to_id and request_to_name.
 */
export async function addRequest(requestData: RequestData) {
  const { amount, description, groupId, createdBy, createdByEmail, requestTo } = requestData;

  try {
    console.log('Adding request with data:', {
      amount,
      description,
      groupId,
      createdBy,
      createdByEmail,
      requestTo
    });

    const requestToJson = {
      id: requestTo.id,
      email: requestTo.email,
      created_by: createdBy,
      created_by_email: createdByEmail
    };

    const result = await sql`
      INSERT INTO requests (
        amount, description, group_id, created_by, request_to, status
      )
      VALUES (
        ${amount}, 
        ${description}, 
        ${groupId}, 
        ${createdBy}, 
        ${JSON.stringify(requestToJson)}::jsonb, 
        'pending'
      )
      RETURNING id
    `;

    if (!result || result.length === 0) {
      throw new Error('No result returned from insert');
    }

    return { success: true, id: result[0]?.id };
  } catch (error) {
    console.error('Detailed error in addRequest:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to add request' };
  }
}

/**
 * Fetches all requests from a group.
 * NOTE: For a real application, you might need to join with a `users` table
 * to get the `created_by_name`. For this example, we assume it's stored
 * or handled in the client. Here, we'll derive it in the calculation logic.
 */
export async function getGroupRequests(groupId: string) {
  try {
    const requests = (await sql`
      SELECT 
        r.id, 
        r.amount, 
        r.description, 
        r.created_by,
        r.request_to->>'created_by_email' as created_by_email,
        jsonb_build_object(
          'id', r.request_to->>'id',
          'email', r.request_to->>'email'
        ) as request_to,
        r.created_at, 
        r.status, 
        r.settled_at, 
        r.settled_by
      FROM requests r
      WHERE r.group_id = ${groupId}
      ORDER BY r.created_at DESC
    `) as Request[];
    return { requests };
  } catch (error) {
    console.error('Error fetching group requests:', error);
    return { requests: [] };
  }
}

/**
 * Deletes a request from the database.
 */
export async function deleteRequest(requestId: string) {
  try {
    await sql`DELETE FROM requests WHERE id = ${requestId}`;
    return { success: true };
  } catch (error) {
    console.error('Error deleting request:', error);
    return { success: false };
  }
}

/**
 * Marks a request as settled.
 */
export async function markRequestAsSettled(requestId: string, settledBy: string) {
  try {
    await sql`
      UPDATE requests
      SET 
        status = 'settled',
        settled_at = CURRENT_TIMESTAMP,
        settled_by = ${settledBy}
      WHERE id = ${requestId}
    `;
    return { success: true };
  } catch (error) {
    console.error('Error marking request as settled:', error);
    return { success: false };
  }
}

/**
 * Deletes a group and all its associated requests.
 */
export async function deleteGroup(groupId: string) {
  try {
    // First delete all requests in the group
    await sql`DELETE FROM requests WHERE group_id = ${groupId}`;
    return { success: true };
  } catch (error) {
    console.error('Error deleting group:', error);
    return { success: false, error: 'Failed to delete group' };
  }
}

// --- SETTLEMENT LOGIC ---

/**
 * Calculates the net balance for each user in a group based on PENDING requests.
 * This is the first step in the settlement process.
 */
async function calculateNetBalances(groupId: string): Promise<UserBalance[]> {
  try {
    const { requests } = await getGroupRequests(groupId);
    if (!requests || requests.length === 0) {
      return [];
    }

    const balances = new Map<string, { email: string; balance: number }>();

    // First pass: Initialize all users with zero balance
    requests.forEach(request => {
      // Initialize creator's balance
      if (!balances.has(request.created_by)) {
        balances.set(request.created_by, {
          email: request.created_by_email || request.created_by,
          balance: 0
        });
      }
      // Initialize recipient's balance
      if (!balances.has(request.request_to.id)) {
        balances.set(request.request_to.id, {
          email: request.request_to.email || request.request_to.id,
          balance: 0
        });
      }
    });

    // Second pass: Calculate net balances for pending requests only
    requests.forEach(request => {
      if (request.status === 'pending') {
        const amount = Number(request.amount);
        
        // Add to sender's balance (positive - they are owed money)
        const senderBalance = balances.get(request.created_by);
        if (senderBalance) {
          const currentBalance = Number(senderBalance.balance);
          senderBalance.balance = Number((currentBalance + amount).toFixed(2));
          balances.set(request.created_by, senderBalance);
        }

        // Subtract from receiver's balance (negative - they owe money)
        const receiver = request.request_to;
        const receiverBalance = balances.get(receiver.id);
        if (receiverBalance) {
          const currentBalance = Number(receiverBalance.balance);
          receiverBalance.balance = Number((currentBalance - amount).toFixed(2));
          balances.set(receiver.id, receiverBalance);
        }
      }
    });

    // Convert to array and filter out zero balances
    const result = Array.from(balances.entries())
      .map(([userId, data]) => ({
        userId,
        userEmail: data.email,
        balance: data.balance
      }))
      .filter(user => Math.abs(user.balance) > 0.01);

    console.log('Final balances:', result);
    return result;
  } catch (error) {
    console.error('Error calculating net balances:', error);
    return [];
  }
}

/**
 * Optimizes transactions to minimize the number of payments required to settle all debts.
 * This is the final step of the settlement logic.
 */
export async function getOptimizedSettlements(groupId: string): Promise<SettlementTransaction[]> {
  try {
    const balances = await calculateNetBalances(groupId);
    if (balances.length === 0) {
      return [];
    }

    const transactions: SettlementTransaction[] = [];

    // Create priority queues for debtors and creditors
    const debtors = balances
      .filter(user => user.balance < 0)
      .sort((a, b) => a.balance - b.balance);

    const creditors = balances
      .filter(user => user.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    if (debtors.length === 0 || creditors.length === 0) {
      return [];
    }

    let debtorIndex = 0;
    let creditorIndex = 0;

    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];

      const amount = Math.min(
        Math.abs(debtor.balance),
        creditor.balance
      );

      if (amount > 0.01) {
        transactions.push({
          from: { id: debtor.userId, email: debtor.userEmail },
          to: { id: creditor.userId, email: creditor.userEmail },
          amount: Number(amount.toFixed(2))
        });

        // Update balances
        debtor.balance = Number((debtor.balance + amount).toFixed(2));
        creditor.balance = Number((creditor.balance - amount).toFixed(2));

        // Move to next debtor or creditor if their balance is settled
        if (Math.abs(debtor.balance) < 0.01) {
          debtorIndex++;
        }
        if (Math.abs(creditor.balance) < 0.01) {
          creditorIndex++;
        }
      } else {
        // If amount is too small, move to next pair
        debtorIndex++;
        creditorIndex++;
      }
    }

    console.log('Final transactions:', transactions);
    return transactions;
  } catch (error) {
    console.error('Error in getOptimizedSettlements:', error);
    return [];
  }
}

/**
 * Deletes an organization using Clerk's API.
 */
export async function deleteOrganization(organizationId: string) {
  try {
    const response = await fetch(`https://api.clerk.dev/v1/organizations/${organizationId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to delete organization');
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting organization:', error);
    return { success: false, error: 'Failed to delete organization' };
  }
}