'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, CheckCircle2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganizationList, useUser, useOrganization } from '@clerk/nextjs';
import { getGroupRequests, deleteRequest, Request as ActionRequest, getOptimizedSettlements, SettlementTransaction, markRequestAsSettled, deleteGroup, deleteOrganization } from '@/app/actions';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

const formatAmount = (amount: number | string) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toFixed(2);
};

function GroupPage() {
  const { id } = useParams();
  const { userMemberships, isLoaded: orgLoaded } = useOrganizationList({ userMemberships: { infinite: true } });
  const { user, isLoaded: userLoaded } = useUser();
  const { organization } = useOrganization();
  const router = useRouter();
  const [requests, setRequests] = useState<ActionRequest[]>([]);
  const [settlements, setSettlements] = useState<SettlementTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (id && user) {
        console.log('Fetching data for group:', id);
        const { requests } = await getGroupRequests(id as string);
        setRequests(requests);
        const optimizedSettlements = await getOptimizedSettlements(id as string);
        setSettlements(optimizedSettlements);
        setLoading(false);
      }
    }
    if (userLoaded) {
      fetchData();
    }
  }, [id, user, userLoaded]);

  if (!userLoaded || !orgLoaded || loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-xl text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <div>You must be logged in to view this page.</div>;
  }

  const selectedOrganization = userMemberships.data?.find(
    (membership) => membership.organization.id === id
  );

  if (!selectedOrganization) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Organization not found</h1>
        <p className="text-gray-600 mb-4">You might not have access to this organization or it doesn't exist.</p>
        <Link href="/groups">
          <Button className="bg-purple-600 text-white px-4 py-2 rounded-md">
            Back to Groups
          </Button>
        </Link>
      </div>
    );
  }

  const isAdmin = selectedOrganization.role === 'org:admin';

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
        // First delete all requests in the group
        const deleteRequestsResult = await deleteGroup(id as string);
        if (!deleteRequestsResult.success) {
          throw new Error('Failed to delete group requests');
        }

        // Then delete the organization
        const deleteOrgResult = await deleteOrganization(id as string);
        if (!deleteOrgResult.success) {
          throw new Error('Failed to delete organization');
        }

        toast.success('Group deleted successfully');
        router.push('/groups');
      } catch (error) {
        console.error('Error deleting group:', error);
        toast.error('Failed to delete group. Please try again.');
      }
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold mb-4">
          {selectedOrganization.organization.name}
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
        settlements.map((settlement, index) => (
          <Card key={index} className="mb-4">
            <CardContent className="p-6">
              <p className="text-lg">
                <span className="font-semibold">{settlement.from.email}</span> should pay{' '}
                <span className="font-semibold">₹{formatAmount(settlement.amount)}</span> to{' '}
                <span className="font-semibold">{settlement.to.email}</span>
              </p>
            </CardContent>
          </Card>
        ))
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