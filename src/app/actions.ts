'use server';

import { neon } from '@neondatabase/serverless';

// Assumption: DATABASE_URL is configured in your environment variables.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}
const sql = neon(process.env.DATABASE_URL);

// --- INTERFACES ---

export interface Group {
  id: string; // UUID
  name: string;
  created_by: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string; // UUID
  user_id: string;
  user_email: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface RequestData {
  amount: number;
  description: string;
  groupId: string; // UUID
  createdBy: string;
  createdByEmail: string;
  requestTo: { id: string; email: string };
}

export interface Request {
  id: string; // UUID
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
 * Creates a new group and adds the creator as an admin.
 */
export async function createGroup(name: string, creatorId: string, creatorEmail: string) {
  try {
    const result = await sql`
      WITH new_group AS (
        INSERT INTO groups (name, created_by)
        VALUES (${name}, ${creatorId})
        RETURNING id
      )
      INSERT INTO group_members (group_id, user_id, user_email, role)
      SELECT id, ${creatorId}, ${creatorEmail}, 'admin'
      FROM new_group
      RETURNING group_id
    `;

    if (!result || result.length === 0) {
      throw new Error('Failed to create group');
    }

    return { success: true, groupId: result[0].group_id };
  } catch (error) {
    console.error('Error creating group:', error);
    return { success: false, error: 'Failed to create group' };
  }
}

/**
 * Adds a member to a group.
 */
export async function addGroupMember(groupId: string, userEmail: string) {
  try {
    // Check if user is already a member
    const existingMember = await sql`
      SELECT 1 FROM group_members 
      WHERE group_id = ${groupId}::uuid AND user_email = ${userEmail}
    `;

    if (existingMember && existingMember.length > 0) {
      return { success: true, message: 'User is already a member' };
    }

    // Add the member to the group with a temporary user_id
    await sql`
      INSERT INTO group_members (group_id, user_id, user_email, role)
      VALUES (${groupId}::uuid, ${userEmail}, ${userEmail}, 'member')
    `;
    return { success: true };
  } catch (error) {
    console.error('Error adding group member:', error);
    return { success: false, error: 'Failed to add member to group' };
  }
}

/**
 * Updates a member's user ID when they log in.
 */
export async function updateMemberUserId(userEmail: string, userId: string) {
  try {
    await sql`
      UPDATE group_members
      SET user_id = ${userId}
      WHERE user_email = ${userEmail} AND user_id = user_email
    `;
    return { success: true };
  } catch (error) {
    console.error('Error updating member user ID:', error);
    return { success: false, error: 'Failed to update member user ID' };
  }
}

/**
 * Gets all groups that a user is a member of.
 */
export async function getUserGroups(userId: string) {
  try {
    const groups = await sql`
      SELECT g.* 
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ${userId}
      ORDER BY g.created_at DESC
    `;
    return { success: true, groups };
  } catch (error) {
    console.error('Error getting user groups:', error);
    return { success: false, error: 'Failed to get user groups' };
  }
}

/**
 * Gets all members of a group.
 */
export async function getGroupMembers(groupId: string) {
  try {
    const members = await sql`
      SELECT user_id, user_email, role
      FROM group_members
      WHERE group_id = ${groupId}::uuid
      ORDER BY role DESC, joined_at ASC
    `;
    return { members };
  } catch (error) {
    console.error('Error fetching group members:', error);
    return { members: [] };
  }
}

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
 * Deletes a group and all its associated data.
 */
export async function deleteGroup(groupId: string) {
  try {
    // First delete all requests in the group
    await sql`DELETE FROM requests WHERE group_id = ${groupId}::uuid`;
    // Then delete all group members
    await sql`DELETE FROM group_members WHERE group_id = ${groupId}::uuid`;
    // Finally delete the group
    await sql`DELETE FROM groups WHERE id = ${groupId}::uuid`;
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
        
        // When someone creates a request, they are owed money (positive balance)
        const creatorBalance = balances.get(request.created_by);
        if (creatorBalance) {
          creatorBalance.balance = Number((creatorBalance.balance + amount).toFixed(2));
          balances.set(request.created_by, creatorBalance);
        }

        // When someone is requested from, they owe money (negative balance)
        const requestToBalance = balances.get(request.request_to.id);
        if (requestToBalance) {
          requestToBalance.balance = Number((requestToBalance.balance - amount).toFixed(2));
          balances.set(request.request_to.id, requestToBalance);
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

    // Sort by balance to ensure consistent order
    result.sort((a, b) => b.balance - a.balance);

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

    // Separate debtors and creditors
    const debtors = balances.filter(user => user.balance < 0);
    const creditors = balances.filter(user => user.balance > 0);

    // For each debtor, find a creditor to settle with
    for (const debtor of debtors) {
      const debtAmount = Math.abs(debtor.balance);
      let remainingDebt = debtAmount;

      for (const creditor of creditors) {
        if (remainingDebt <= 0.01) break;
        if (creditor.balance <= 0.01) continue;
        if (debtor.userId === creditor.userId) continue;

        const amount = Math.min(remainingDebt, creditor.balance);
        if (amount > 0.01) {
          transactions.push({
            from: { id: debtor.userId, email: debtor.userEmail },
            to: { id: creditor.userId, email: creditor.userEmail },
            amount: Number(amount.toFixed(2))
          });

          remainingDebt = Number((remainingDebt - amount).toFixed(2));
          creditor.balance = Number((creditor.balance - amount).toFixed(2));
        }
      }
    }

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

/**
 * Stores a settlement transaction in the database.
 */
export async function storeSettlement(groupId: string, fromId: string, toId: string, amount: number) {
  try {
    await sql`
      INSERT INTO settlements (
        group_id, from_user_id, to_user_id, amount, status, created_at
      )
      VALUES (
        ${groupId}::uuid,
        ${fromId},
        ${toId},
        ${amount},
        'pending',
        CURRENT_TIMESTAMP
      )
    `;
    return { success: true };
  } catch (error) {
    console.error('Error storing settlement:', error);
    return { success: false, error: 'Failed to store settlement' };
  }
}

/**
 * Gets all settlements for a group.
 */
export async function getGroupSettlements(groupId: string) {
  try {
    const settlements = await sql`
      SELECT 
        s.*,
        from_user.user_email as from_email,
        to_user.user_email as to_email
      FROM settlements s
      JOIN group_members from_user ON s.from_user_id = from_user.user_id
      JOIN group_members to_user ON s.to_user_id = to_user.user_id
      WHERE s.group_id = ${groupId}::uuid
      ORDER BY s.created_at DESC
    `;
    return { success: true, settlements };
  } catch (error) {
    console.error('Error getting settlements:', error);
    return { success: false, error: 'Failed to get settlements' };
  }
}

/**
 * Marks a settlement as completed.
 */
export async function markSettlementAsCompleted(
  groupId: string,
  fromId: string,
  toId: string,
  amount: number
) {
  try {
    // Find and mark the corresponding requests as settled
    const { requests } = await getGroupRequests(groupId);
    const pendingRequests = requests.filter(req => req.status === 'pending');
    
    let remainingAmount = amount;
    for (const request of pendingRequests) {
      if (remainingAmount <= 0) break;
      
      if (request.created_by === toId && request.request_to.id === fromId) {
        const settleAmount = Math.min(remainingAmount, request.amount);
        await markRequestAsSettled(request.id, fromId);
        remainingAmount -= settleAmount;
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking settlement as completed:', error);
    return { success: false, error: 'Failed to mark settlement as completed' };
  }
}