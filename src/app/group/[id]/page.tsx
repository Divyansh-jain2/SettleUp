'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganizationList, useUser } from '@clerk/nextjs';
import { getGroupData, deleteExpense } from '@/app/actions';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

interface Balance {
  id: string;
  name: string;
  amount: number;
  owes: boolean;
}

interface Expense {
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

const formatAmount = (amount: number | string) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return numAmount.toFixed(2);
};

/* 
  getColorForUser returns a deterministic background color class
  based on a provided string (typically a user id).
*/
const getColorForUser = (str: string): string => {
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500', 'bg-purple-500'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

function GroupPage() {
  // All hooks are now called unconditionally
  const { id } = useParams();
  const { userMemberships, isLoaded: orgLoaded } = useOrganizationList({ userMemberships: { infinite: true } });
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);

  // Use effect to fetch group data once all hooks are loaded
  useEffect(() => {
    async function fetchData() {
      if (id && user) {
        const { expenses, balances } = await getGroupData(
          id as string,
          user.id,
          user.fullName || 'You'
        );
        setExpenses(expenses);
        setBalances(balances);
        setLoading(false);
      }
    }
    if (userLoaded) {
      fetchData();
    }
  }, [id, user, userLoaded]);

  // Render fallback UI if user/org data are loading or user is not logged in
  if (!userLoaded || !orgLoaded || loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-xl text-gray-600">Loading...</p>
      </div>
    );
  }

  // Even if userLoaded is true, user could be null so render a message.
  if (!user) {
    return <div>You must be logged in to view this page.</div>;
  }

  const selectedOrganization = userMemberships.data?.find(
    (membership) => membership.organization.id === id
  );

  if (!selectedOrganization) {
    return <div>Organization not found</div>;
  }

  const isAdmin = selectedOrganization.role === 'org:admin';
  const groupDescription =
    "View and manage the details of your group. You can see the group's name, balances, and expenses. As an admin, you can also delete expenses.";

  const handleDeleteExpense = async (expenseId: string) => {
    if (!isAdmin) {
      toast.error('Only admins can delete expenses. 🚫');
      return;
    }

    const confirmed = window.confirm('Are you sure you want to delete this expense?');
    if (confirmed) {
      const result = await deleteExpense(expenseId);
      if (result.success) {
        const { expenses: updatedExpenses, balances: updatedBalances } =
          await getGroupData(id as string, user.id, user.fullName || 'You');
        setExpenses(updatedExpenses);
        setBalances(updatedBalances);
        router.refresh();
      } else {
        toast.error('Failed to delete expense. Please try again.');
      }
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold mb-4">
          {selectedOrganization.organization.name}
        </h1>
        <Link href="/groups">
          <Button className="bg-purple-600 text-white px-4 py-2 rounded-md">
            All Groups
          </Button>
        </Link>
      </div>

      <p className="text-gray-600 mb-8">{groupDescription}</p>

      <h2 className="text-2xl font-semibold mb-4">Balances</h2>
      {balances.length > 0 ? (
        balances.map((balance) => (
          <Card key={balance.id} className="mb-8">
            <CardContent className="flex items-center p-6">
              <div
                className={`h-10 w-10 ${getColorForUser(balance.id)} rounded-full mr-4 flex items-center justify-center text-white font-semibold`}
              >
                {getInitials(balance.name)}
              </div>
              <div>
                <h3 className="font-semibold">{balance.name}</h3>
                <p className="text-sm text-gray-600">
                  Owes you ${formatAmount(balance.amount)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <p className="text-gray-600 mb-8">
          🌟 No outstanding balances. Everyone&apos;s all squared up! 🎉
        </p>
      )}

      <h2 className="text-2xl font-semibold mb-4">Expenses</h2>
      {expenses.length > 0 ? (
        expenses.map((expense) => (
          <Card key={expense.id} className="mb-4">
            <CardContent className="flex items-center justify-between p-6">
              <div className="flex items-center">
                <div
                  className={`h-10 w-10 ${getColorForUser(expense.created_by)} rounded-full mr-4 flex items-center justify-center text-white font-semibold`}
                >
                  {getInitials(expense.description)}
                </div>
                <div>
                  <h3 className="font-semibold">{expense.description}</h3>
                  <p className="text-sm text-gray-600">
                    ${formatAmount(expense.amount)} ·{' '}
                    {expense.split_with.map((s) => s.name).join(', ')}
                  </p>
                  <p className="text-xs text-gray-500">
                    Split type: Percentage{' '}
                    {((expense.split_with[0]?.splitAmount / expense.amount) * 100).toFixed(2)}%
                  </p>
                </div>
              </div>
              <Trash2
                className="text-red-500 cursor-pointer"
                size={20}
                onClick={() => handleDeleteExpense(expense.id)}
              />
            </CardContent>
          </Card>
        ))
      ) : (
        <p className="text-gray-600 mb-8">
          💸 No expenses yet. Time to split some bills! 🧾
        </p>
      )}
    </div>
  );
}

export default GroupPage;