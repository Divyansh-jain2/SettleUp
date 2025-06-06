'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, CheckCircle2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { getGroupRequests, deleteRequest, Request as ActionRequest, getOptimizedSettlements, SettlementTransaction, markRequestAsSettled, deleteGroup, getGroupMembers, getUserGroups } from '@/app/actions';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

const formatAmount = (amount: number | string) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toFixed(2);
};

function GroupPage() {
  const { id } = useParams();
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();
  const [requests, setRequests] = useState<ActionRequest[]>([]);
  const [settlements, setSettlements] = useState<SettlementTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (id && user) {
        try {
          // Get group name and check if user is admin
          const { groups } = await getUserGroups(user.id);
          const currentGroup = groups?.find(g => g.id === id);
          if (currentGroup) {
            setGroupName(currentGroup.name);
          }

          // Get group members to check if user is admin
          const { members } = await getGroupMembers(id as string);
          const currentUser = members.find(m => m.user_id === user.id);
          setIsAdmin(currentUser?.role === 'admin');

          // Get group requests and settlements
          const { requests } = await getGroupRequests(id as string);
          setRequests(requests);
          const optimizedSettlements = await getOptimizedSettlements(id as string);
          setSettlements(optimizedSettlements);
          setLoading(false);
        } catch (error) {
          console.error('Error fetching group data:', error);
          toast.error('Failed to load group data');
          setLoading(false);
        }
      }
    }
    if (userLoaded) {
      fetchData();
    }
  }, [id, user, userLoaded]);

  if (!userLoaded || loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-xl text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <div>You must be logged in to view this page.</div>;
  }

  const handleDeleteRequest = async (requestId: string) => {
    if (!isAdmin) {
      toast.error('Only admins can delete requests.');
      return;
    }
    const confirmed = window.confirm('Are you sure you want to delete this request?');
    if (confirmed) {
      const result = await deleteRequest(requestId);
      if (result.success) {
        const { requests: updatedRequests } = await getGroupRequests(id as string);
        setRequests(updatedRequests);
        router.refresh();
      } else {
        toast.error('Failed to delete request. Please try again.');
      }
    }
  };

  const handleMarkAsSettled = async (requestId: string) => {
    if (!user) return;
    
    const result = await markRequestAsSettled(requestId, user.id);
    if (result.success) {
      const { requests: updatedRequests } = await getGroupRequests(id as string);
      setRequests(updatedRequests);
      const optimizedSettlements = await getOptimizedSettlements(id as string);
      setSettlements(optimizedSettlements);
      toast.success('Request marked as settled');
    } else {
      toast.error('Failed to mark request as settled');
    }
  };

  const handleDeleteGroup = async () => {
    if (!isAdmin) {
      toast.error('Only admins can delete groups.');
      return;
    }

    const confirmed = window.confirm('Are you sure you want to delete this group? This will delete all requests in the group and cannot be undone.');
    if (confirmed) {
      try {
        const result = await deleteGroup(id as string);
        if (!result.success) {
          throw new Error('Failed to delete group');
        }

        toast.success('Group deleted successfully');
        
        // Refresh the page data
        router.refresh();
        
        // Wait a moment for the refresh to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Then redirect to groups page
        router.push('/groups');
      } catch (error) {
        console.error('Error deleting group:', error);
        toast.error('Failed to delete group. Please try again.');
      }
    }
  };

  const handleMarkSettlementAsCompleted = async (settlement: SettlementTransaction) => {
    if (!user) return;
    
    try {
      // Get all pending requests
      const { requests } = await getGroupRequests(id as string);
      const pendingRequests = requests.filter(req => req.status === 'pending');
      
      // Find requests that match this settlement
      const matchingRequests = pendingRequests.filter(req => 
        req.created_by === settlement.to.id && 
        req.request_to.id === settlement.from.id
      );

      // Mark matching requests as settled
      let remainingAmount = settlement.amount;
      for (const request of matchingRequests) {
        if (remainingAmount <= 0) break;
        
        const settleAmount = Math.min(remainingAmount, Number(request.amount));
        await markRequestAsSettled(request.id, user.id);
        remainingAmount -= settleAmount;
      }

      // Refresh the data
      const { requests: updatedRequests } = await getGroupRequests(id as string);
      setRequests(updatedRequests);
      const optimizedSettlements = await getOptimizedSettlements(id as string);
      setSettlements(optimizedSettlements);
      toast.success('Settlement marked as completed');
    } catch (error) {
      console.error('Error marking settlement as completed:', error);
      toast.error('Failed to mark settlement as completed');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold mb-4">
          {groupName}
        </h1>
        <div className="flex gap-2">
          {isAdmin && (
            <Button 
              variant="destructive" 
              onClick={handleDeleteGroup}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Group
            </Button>
          )}
          <Link href="/groups">
            <Button className="bg-purple-600 text-white px-4 py-2 rounded-md">
              All Groups
            </Button>
          </Link>
        </div>
      </div>

      <h2 className="text-2xl font-semibold mb-4">Optimized Settlements</h2>
      {settlements.length > 0 ? (
        <>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-600">Here's how to settle all debts:</p>
            <Button
              onClick={async () => {
                if (!user) return;
                try {
                  // Get all pending requests
                  const { requests } = await getGroupRequests(id as string);
                  const pendingRequests = requests.filter(req => req.status === 'pending');
                  
                  // Mark all pending requests as settled
                  for (const request of pendingRequests) {
                    await markRequestAsSettled(request.id, user.id);
                  }

                  // Refresh the data
                  const { requests: updatedRequests } = await getGroupRequests(id as string);
                  setRequests(updatedRequests);
                  const optimizedSettlements = await getOptimizedSettlements(id as string);
                  setSettlements(optimizedSettlements);
                  toast.success('All requests marked as settled');
                } catch (error) {
                  console.error('Error marking all as settled:', error);
                  toast.error('Failed to mark all as settled');
                }
              }}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Mark All as Settled
            </Button>
          </div>
          {settlements.map((settlement, index) => (
            <Card key={index} className="mb-4">
              <CardContent className="p-6">
                <p className="text-lg">
                  <span className="font-semibold">{settlement.from.email}</span> should pay{' '}
                  <span className="font-semibold">₹{formatAmount(settlement.amount)}</span> to{' '}
                  <span className="font-semibold">{settlement.to.email}</span>
                </p>
              </CardContent>
            </Card>
          ))}
        </>
      ) : (
        <p className="text-gray-600 mb-8">No settlements needed. All debts are balanced.</p>
      )}

      <h2 className="text-2xl font-semibold mb-4 mt-8">Requests</h2>
      {requests.length > 0 ? (
        requests.map((req) => (
          <Card key={req.id} className="mb-4">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <h3 className="font-semibold">{req.description}</h3>
                <p className="text-sm text-gray-600">
                  Amount: ₹{formatAmount(req.amount)} | Created by: {req.created_by_email} | Request To: {req.request_to.email}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Status: <span className={req.status === 'settled' ? 'text-green-600' : 'text-yellow-600'}>
                    {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                  </span>
                  {req.settled_at && ` • Settled on ${new Date(req.settled_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {req.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMarkAsSettled(req.id)}
                    className="text-green-600 hover:text-green-700"
                  >
                    <CheckCircle2 size={20} />
                  </Button>
                )}
                {isAdmin && (
                  <Trash2
                    className="text-red-500 cursor-pointer"
                    size={20}
                    onClick={() => handleDeleteRequest(req.id)}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <p className="text-gray-600 mb-8">No requests found in this group.</p>
      )}
    </div>
  );
}

export default GroupPage;