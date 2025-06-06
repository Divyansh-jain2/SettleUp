'use client';

import { useUser } from '@clerk/nextjs';
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { addRequest, getUserGroups, getGroupMembers, Group } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Member {
  user_id: string;
  user_email: string;
  role: string;
}

export default function AddRequest() {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [group, setGroup] = useState('');
  const [requestTo, setRequestTo] = useState<Member | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, isLoaded: isUserLoaded } = useUser();

  useEffect(() => {
    async function fetchGroups() {
      if (user) {
        try {
          const result = await getUserGroups(user.id);
          if (result.success && result.groups) {
            setGroups(result.groups as Group[]);
            if (result.groups.length > 0 && !group) {
              const defaultGroupId = result.groups[0].id;
              setGroup(defaultGroupId);
              fetchMembers(defaultGroupId);
            }
          }
          setLoading(false);
        } catch (error) {
          console.error('Error fetching groups:', error);
          toast.error('Failed to fetch groups');
          setLoading(false);
        }
      }
    }
    if (isUserLoaded) {
      fetchGroups();
    }
  }, [isUserLoaded, user, group]);

  const fetchMembers = async (groupId: string) => {
    try {
      const { members } = await getGroupMembers(groupId);
      const filteredMembers = members.filter(member => member.user_id !== user?.id);
      setMembers(filteredMembers as Member[]);
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Failed to fetch group members');
    }
  };

  const handleGroupChange = (groupId: string) => {
    setGroup(groupId);
    fetchMembers(groupId);
    setRequestTo(null);
  };

  const handleRequestToSelect = (value: string) => {
    const selectedMember = members.find((member) => member.user_id === value);
    if (selectedMember) {
      setRequestTo(selectedMember);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isUserLoaded || !user) {
      toast.error("You need to be logged in to make a request.");
      return;
    }
    if (!requestTo) {
      toast.error("Please select a user to request from.");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount greater than 0.");
      return;
    }

    if (!user.emailAddresses?.[0]?.emailAddress) {
      toast.error("Your email address is not available. Please update your profile.");
      return;
    }

    const requestData = {
      amount: parseFloat(amount),
      description,
      groupId: group,
      createdBy: user.id,
      requestTo: { 
        id: requestTo.user_id, 
        email: requestTo.user_email 
      },
      createdByEmail: user.emailAddresses[0].emailAddress
    };

    try {
      console.log('Submitting request with data:', requestData);
      const result = await addRequest(requestData);
      if (result.success) {
        toast.success('Request sent successfully!');
        setAmount('');
        setDescription('');
        setRequestTo(null);
      } else {
        console.error('Failed to add request:', result.error);
        toast.error(result.error || "Failed to send request. Please try again.");
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      toast.error("An unexpected error occurred while sending your request.");
    }
  };

  if (!isUserLoaded || loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Make a Request</h1>
      <p className="text-gray-600 mb-6">Request money from a group member.</p>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
            Amount
          </Label>
          <Input
            id="amount"
            type="number"
            placeholder="₹0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full"
          />
        </div>
        <div>
          <Label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </Label>
          <Input
            id="description"
            placeholder="Enter a brief description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            className="w-full"
          />
        </div>
        <div>
          <Label htmlFor="group" className="block text-sm font-medium text-gray-700 mb-1">
            Group
          </Label>
          {groups.length > 0 ? (
            <Select onValueChange={handleGroupChange} value={group} required>
              <SelectTrigger id="group" className="w-full">
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-gray-500">No groups available. Please create or join a group first.</p>
          )}
        </div>
        <div>
          <Label htmlFor="requestTo" className="block text-sm font-medium text-gray-700 mb-1">
            Request From
          </Label>
          <Select onValueChange={handleRequestToSelect} disabled={!group}>
            <SelectTrigger id="requestTo" className="w-full">
              <SelectValue placeholder="Select a member" />
            </SelectTrigger>
            <SelectContent>
              {members.length > 0 ? (
                members.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.user_email}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="no-members" disabled>
                  No other members in this group
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="w-full" disabled={members.length === 0}>
          Send Request
        </Button>
      </form>
    </div>
  );
}