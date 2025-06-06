'use client';

import { useUser } from '@clerk/nextjs';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { createGroup, addGroupMember } from '../actions';

export default function CreateGroup() {
  const [groupName, setGroupName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberEmails, setMemberEmails] = useState<string[]>([]);
  const { user, isLoaded } = useUser();
  const router = useRouter();

  const handleAddMember = () => {
    if (!memberEmail || !memberEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (memberEmails.includes(memberEmail)) {
      toast.error('This email is already in the list');
      return;
    }
    setMemberEmails([...memberEmails, memberEmail]);
    setMemberEmail('');
  };

  const handleRemoveMember = (email: string) => {
    setMemberEmails(memberEmails.filter(e => e !== email));
  };

  const handleCreateGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      toast.error('You must be logged in to create a group');
      return;
    }

    if (!user.emailAddresses?.[0]?.emailAddress) {
      toast.error('Your email address is not available');
      return;
    }

    try {
      // Create the group
      const result = await createGroup(
        groupName,
        user.id,
        user.emailAddresses[0].emailAddress
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create group');
      }

      // Add members to the group
      for (const email of memberEmails) {
        const memberResult = await addGroupMember(result.groupId, email);
        if (!memberResult.success) {
          console.warn(`Failed to add member ${email}: ${memberResult.error}`);
        }
      }

      toast.success('Group created successfully!');
      router.push(`/group/${result.groupId}`);
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('Failed to create group. Please try again.');
    }
  };

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Create a New Group</h1>
      <p className="text-gray-600 mb-6">Create a group and add members to start splitting expenses.</p>
      <form onSubmit={handleCreateGroup} className="space-y-6">
        <div>
          <Label htmlFor="groupName" className="block text-sm font-medium text-gray-700 mb-1">
            Group Name
          </Label>
          <Input
            id="groupName"
            placeholder="Enter group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            required
            className="w-full"
          />
        </div>

        <div>
          <Label htmlFor="memberEmail" className="block text-sm font-medium text-gray-700 mb-1">
            Add Members
          </Label>
          <div className="flex gap-2">
            <Input
              id="memberEmail"
              type="email"
              placeholder="Enter member's email"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              className="flex-1"
            />
            <Button type="button" onClick={handleAddMember}>
              Add
            </Button>
          </div>
        </div>

        {memberEmails.length > 0 && (
          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">
              Members
            </Label>
            <div className="space-y-2">
              {memberEmails.map((email) => (
                <div key={email} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                  <span>{email}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveMember(email)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button type="submit" className="w-full">
          Create Group
        </Button>
      </form>
    </div>
  );
}