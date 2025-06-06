'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOrganizationList, useUser } from '@clerk/nextjs';
import { PlusCircle } from 'lucide-react';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface Organization {
  id: string;
  name: string;
  role: string;
}

export default function CreateGroup() {
  const [groupName, setGroupName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitedMembers, setInvitedMembers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useUser();
  const { createOrganization, userMemberships } = useOrganizationList();
  const router = useRouter();

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('You must be logged in to create a group');
      return;
    }

    setIsLoading(true);
    try {
      if (!createOrganization) {
        throw new Error('createOrganization function is undefined');
      }
      const organization = await createOrganization({ name: groupName });

      // Invite members individually and catch errors for already existing members.
      for (const email of invitedMembers) {
        try {
          await organization.inviteMember({
            emailAddress: email,
            role: 'org:member',
          });
        } catch (inviteError: any) {
          if (
            inviteError?.message &&
            inviteError.message.includes('is already a member')
          ) {
            console.info(`${email} is already a member, skipping invite.`);
          } else {
            console.error('Error inviting member:', inviteError);
            toast.error(`Failed to invite ${email}.`);
          }
        }
      }

      // Wait for the organization list to be refreshed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify that the organization exists in the user's memberships
      const orgExists = userMemberships.data?.some(
        membership => membership.organization.id === organization.id
      );

      if (!orgExists) {
        throw new Error('Organization not found in user memberships');
      }

      toast.success('Group created successfully!');
      router.push(`/group/${organization.id}`);
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('Failed to create group. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = () => {
    if (inviteEmail && !invitedMembers.includes(inviteEmail)) {
      setInvitedMembers([...invitedMembers, inviteEmail]);
      setInviteEmail('');
    }
  };

  const organizations = userMemberships.data?.map((membership) => ({
    id: membership.organization.id,
    name: membership.organization.name,
    role: membership.role,
  })) as Organization[];

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Create a group</h1>
      <p className="text-gray-600 mb-6">
        Split expenses with friends, roommates, and more.
      </p>

      <form onSubmit={handleCreateGroup} className="space-y-6">
        <div>
          <label
            htmlFor="groupName"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Group name
          </label>
          <Input
            id="groupName"
            name="groupName"
            type="text"
            placeholder="Enter group name"
            className="w-full"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            required
          />
        </div>

        <div>
          <label
            htmlFor="inviteEmail"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Invite members
          </label>
          <div className="flex space-x-2">
            <Input
              id="inviteEmail"
              name="inviteEmail"
              type="email"
              placeholder="Enter email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-grow"
            />
            <Button type="button" onClick={handleInvite} disabled={isLoading}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Invite
            </Button>
          </div>
        </div>

        {invitedMembers.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Invited members:
            </h3>
            <ul className="list-disc pl-5">
              {invitedMembers.map((email, index) => (
                <li key={index}>{email}</li>
              ))}
            </ul>
          </div>
        )}

        <Button className="w-full" type="submit" disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Group'}
        </Button>
      </form>
    </div>
  );
}