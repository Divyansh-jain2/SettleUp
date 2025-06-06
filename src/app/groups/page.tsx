'use client';

import { useUser } from '@clerk/nextjs';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { getUserGroups, updateMemberUserId } from '@/app/actions';
import type { Group } from '@/app/actions';
import toast from 'react-hot-toast';

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    async function fetchGroups() {
      if (user) {
        try {
          // Update any pending memberships with the user's ID
          await updateMemberUserId(user.emailAddresses[0].emailAddress, user.id);
          
          // Fetch groups
          const result = await getUserGroups(user.id);
          if (result.success) {
            setGroups(result.groups as Group[]);
          }
        } catch (error) {
          console.error('Error fetching groups:', error);
          toast.error('Failed to load groups');
        } finally {
          setLoading(false);
        }
      }
    }

    if (isLoaded) {
      fetchGroups();
    }
  }, [isLoaded, user]);

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Please sign in to view your groups.</div>;
  }

  if (loading) {
    return <div>Loading groups...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Your Groups</h1>
        <Button onClick={() => router.push('/group')}>Create New Group</Button>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">You haven't joined any groups yet.</p>
          <Button 
            onClick={() => router.push('/group')}
            className="mt-4"
          >
            Create Your First Group
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <Card key={group.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                <h2 className="text-xl font-semibold mb-2">{group.name}</h2>
                <p className="text-sm text-gray-500">
                  Created on {new Date(group.created_at).toLocaleDateString()}
                </p>
                <Button
                  onClick={() => router.push(`/group/${group.id}`)}
                  className="mt-4 w-full"
                >
                  View Group
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}