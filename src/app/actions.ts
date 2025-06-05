'use server';

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

interface SplitMember {
  id: string;
  name: string;
}

export interface ExpenseData {
  amount: number;
  description: string;
  groupId: string;
  splitPercentage: number;
  splitWith: SplitMember[];
  createdBy: string;
}

export interface Balance {
  id: string;
  name: string;
  amount: number;
  owes: boolean;
}

export interface Expense {
  id: string;
  amount: number;
  description: string;
  created_by: string;
  split_with: {
    id: string;
    name: string;
    splitAmount: number;
  }[];
}

export async function addExpense(expenseData: ExpenseData) {
  const { amount, description, groupId, splitPercentage, splitWith, createdBy } = expenseData;

  try {
    // Calculate split amount for each member
    const splitAmount = (amount * (splitPercentage / 100)) / splitWith.length;
    
    // Create a JSON object with member information and split amounts
    const splitWithInfo = splitWith.map((member) => ({
      id: member.id,
      name: member.name,
      splitAmount: splitAmount,
    }));

    // Insert the expense
    await sql`
      INSERT INTO expenses (
        amount, description, group_id, split_percentage, created_by, split_with
      )
      VALUES (
        ${amount}, ${description}, ${groupId}, ${splitPercentage}, ${createdBy}, ${JSON.stringify(splitWithInfo)}
      )
    `;

    return { success: true };
  } catch (error) {
    console.error('Error adding expense:', error);
    return { success: false };
  }
}

/* 
  Updated getGroupData:
  • Uses a Map keyed by user ID.
  • For each expense, calculates:
      - creator's effective share = total amount minus sum owed by split members.
      - Each split member’s balance is reduced by their splitAmount.
  • Returns balances for users (other than the current user) that have a negative balance (i.e. they owe money).
*/
export async function getGroupData(groupId: string, currentUserId: string, currentUserName: string) {
  try {
    const expenses = (await sql`
      SELECT id, amount, description, created_by, split_with
      FROM expenses
      WHERE group_id = ${groupId}
      ORDER BY created_at DESC
    `) as Expense[];

    // balanceMap keyed by user id, storing an object with amount and name
    const balanceMap = new Map<string, { amount: number; name: string }>();

    expenses.forEach((expense) => {
      // Calculate the total split amount across members
      const totalSplit = expense.split_with.reduce(
        (sum: number, member: { splitAmount: number }) => sum + member.splitAmount,
        0
      );
      // Creator's effective share = what they paid minus what others owe
      const creatorShare = expense.amount - totalSplit;
      const creatorId = expense.created_by;

      // Get creator's name.
      // If the creator is not among the split_with, we fallback to their ID.
      let creatorName = creatorId;
      const match = expense.split_with.find((m) => m.id === creatorId);
      if (match) {
        creatorName = match.name;
      }

      // Update creator's balance using creator's id as key
      const creatorBalance = balanceMap.get(creatorId) || { amount: 0, name: creatorName };
      creatorBalance.amount += creatorShare;
      balanceMap.set(creatorId, creatorBalance);

      // For each split member, subtract their split amount
      expense.split_with.forEach((member) => {
        const memberBalance = balanceMap.get(member.id) || { amount: 0, name: member.name };
        memberBalance.amount -= member.splitAmount;
        balanceMap.set(member.id, memberBalance);
      });
    });

    // Build balances array for users (other than currentUser) with negative balance
    const balances: Balance[] = [];
    balanceMap.forEach((value, key) => {
      if (key !== currentUserId && value.amount < 0) {
        balances.push({
          id: key,
          name: value.name,
          amount: Math.abs(value.amount),
          owes: true,
        });
      }
    });

    return { expenses, balances };
  } catch (error) {
    console.error('Error fetching group data:', error);
    return { expenses: [], balances: [] };
  }
}

export async function deleteExpense(expenseId: string) {
  try {
    await sql`
      DELETE FROM expenses
      WHERE id = ${expenseId}
    `;
    return { success: true };
  } catch (error) {
    console.error('Error deleting expense:', error);
    return { success: false };
  }
}