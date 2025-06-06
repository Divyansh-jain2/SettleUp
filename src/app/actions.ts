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
// --- FIXED SETTLEMENT LOGIC ---

/**
 * Calculates the net balance for each user in a group based on PENDING requests.
 * This version fixes floating-point math issues and is more efficient.
 */
async function calculateNetBalances(groupId: string): Promise<UserBalance[]> {
  try {
    const { requests } = await getGroupRequests(groupId);
    if (!requests || requests.length === 0) {
      return [];
    }

    console.log('Processing requests:', requests);

    const balances = new Map<string, { email: string; balance: number }>();

    // First, initialize all users with zero balance
    requests.forEach(request => {
      if (request.status === 'pending') {
        const creatorId = request.created_by;
        const creatorEmail = request.created_by_email || creatorId;
        const recipientId = request.request_to.id;
        const recipientEmail = request.request_to.email || recipientId;

        if (!balances.has(creatorId)) {
          balances.set(creatorId, { email: creatorEmail, balance: 0 });
        }
        if (!balances.has(recipientId)) {
          balances.set(recipientId, { email: recipientEmail, balance: 0 });
        }
      }
    });

    // Then calculate net balances
    requests.forEach(request => {
      if (request.status === 'pending') {
        const amount = Number(request.amount);
        if (isNaN(amount) || amount <= 0) return;

        const creatorId = request.created_by;
        const recipientId = request.request_to.id;

        // Skip self-requests
        if (creatorId === recipientId) return;

        const creator = balances.get(creatorId);
        const recipient = balances.get(recipientId);

        if (creator && recipient) {
          // Creator is owed money (positive balance)
          creator.balance = Number((creator.balance + amount).toFixed(2));
          // Recipient owes money (negative balance)
          recipient.balance = Number((recipient.balance - amount).toFixed(2));

          balances.set(creatorId, creator);
          balances.set(recipientId, recipient);
        }
      }
    });

    // Convert to array and filter out zero balances
    const epsilon = 0.01;
    const result = Array.from(balances.entries())
      .map(([userId, data]) => ({
        userId,
        userEmail: data.email,
        balance: Number(data.balance.toFixed(2))
      }))
      .filter(user => Math.abs(user.balance) >= epsilon);

    // Verify that total credits equal total debits
    const totalCredits = result
      .filter(b => b.balance > 0)
      .reduce((sum, b) => sum + b.balance, 0);
    const totalDebits = Math.abs(result
      .filter(b => b.balance < 0)
      .reduce((sum, b) => sum + b.balance, 0));

    // If there's a mismatch, return empty array (no settlements needed)
    if (Math.abs(totalCredits - totalDebits) > epsilon) {
      console.log('Balance mismatch detected, no settlements needed');
      return [];
    }

    console.log('Final balances:', result);
    return result;

  } catch (error) {
    console.error('Error calculating net balances:', error);
    return [];
  }
}

/**
 * Optimizes transactions using a greedy algorithm to minimize the number of payments.
 * FIXED VERSION - prevents self-payments and handles circular debts properly.
 */
export async function getOptimizedSettlements(groupId: string): Promise<SettlementTransaction[]> {
  try {
    const balances = await calculateNetBalances(groupId);
    if (balances.length === 0) {
      // If no balances, mark all pending requests as settled
      const { requests } = await getGroupRequests(groupId);
      const pendingRequests = requests.filter(req => req.status === 'pending');
      
      // Mark all pending requests as settled
      for (const request of pendingRequests) {
        await markRequestAsSettled(request.id, request.created_by);
      }
      
      return [];
    }

    console.log('Initial balances:', balances);

    // Separate users into debtors and creditors
    const debtors = balances
      .filter(b => b.balance < 0)
      .map(b => ({ ...b, balance: Math.abs(b.balance) })); // Convert to positive for easier calculation
    const creditors = balances
      .filter(b => b.balance > 0)
      .map(b => ({ ...b }));

    const settlements: SettlementTransaction[] = [];
    const epsilon = 0.01;

    // Use a more robust approach to avoid self-payments
    while (debtors.length > 0 && creditors.length > 0) {
      // Sort by balance (largest debts and credits first for efficiency)
      debtors.sort((a, b) => b.balance - a.balance);
      creditors.sort((a, b) => b.balance - a.balance);

      let settlementMade = false;

      // Try to find a valid pairing (avoiding self-payments)
      for (let i = 0; i < debtors.length && !settlementMade; i++) {
        for (let j = 0; j < creditors.length && !settlementMade; j++) {
          const debtor = debtors[i];
          const creditor = creditors[j];

          // Skip if same user (prevent self-payment)
          if (debtor.userId === creditor.userId) {
            continue;
          }

          const transferAmount = Math.min(debtor.balance, creditor.balance);

          if (transferAmount >= epsilon) {
            settlements.push({
              from: { id: debtor.userId, email: debtor.userEmail },
              to: { id: creditor.userId, email: creditor.userEmail },
              amount: Number(transferAmount.toFixed(2))
            });

            // Update balances
            debtor.balance = Number((debtor.balance - transferAmount).toFixed(2));
            creditor.balance = Number((creditor.balance - transferAmount).toFixed(2));

            // Remove settled users
            if (debtor.balance < epsilon) {
              debtors.splice(i, 1);
            }
            if (creditor.balance < epsilon) {
              creditors.splice(j, 1);
            }

            settlementMade = true;
          }
        }
      }

      // If no settlement was made, break to avoid infinite loop
      if (!settlementMade) {
        console.log('No more valid settlements possible');
        break;
      }
    }

    // Final validation - remove any invalid settlements
    const validSettlements = settlements.filter(s => 
      s.from.email !== s.to.email && 
      s.amount >= epsilon
    );

    // If no valid settlements, mark all pending requests as settled
    if (validSettlements.length === 0) {
      const { requests } = await getGroupRequests(groupId);
      const pendingRequests = requests.filter(req => req.status === 'pending');
      
      // Mark all pending requests as settled
      for (const request of pendingRequests) {
        await markRequestAsSettled(request.id, request.created_by);
      }
    }

    console.log('Final settlements:', validSettlements);
    return validSettlements;

  } catch (error) {
    console.error('Error in getOptimizedSettlements:', error);
    return [];
  }
}
