'use client';

import { useOrganization, useOrganizationList, useUser } from '@clerk/nextjs';
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { addRequest } from '../actions';
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

interface Organization {
  id: string;
  name: string;
}

interface Member {
  id: string;
  name: string;
  email: string;
}

export default function AddRequest() {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [group, setGroup] = useState('');
  const [requestTo, setRequestTo] = useState<Member | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const { user, isLoaded: isUserLoaded } = useUser();
  const { userMemberships, isLoaded: isOrgListLoaded } = useOrganizationList({ userMemberships: true });
  const { isLoaded: isOrgLoaded } = useOrganization();

  const fetchMembers = useCallback(async (orgId: string) => {
    try {
      const org = userMemberships.data?.find(
        (membership) => membership.organization.id === orgId
      )?.organization;
      if (org) {
        const memberships = await org.getMemberships();
        const membersList = memberships.data.map((membership) => ({
          id: membership.publicUserData?.userId ?? '',
          name: `${membership.publicUserData?.firstName ?? ''} ${membership.publicUserData?.lastName ?? ''}`.trim(),
          email: membership.publicUserData?.identifier ?? '',
        }));
        console.log('Fetched members:', membersList);
        setMembers(membersList);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
      toast.error('Failed to fetch group members. Please try again.');
    }
  }, [userMemberships.data]);

  useEffect(() => {
    if (isOrgListLoaded && userMemberships.data) {
      const orgs = userMemberships.data.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
      }));
      setOrganizations(orgs);
      if (orgs.length > 0 && !group) {
        const defaultOrgId = orgs[0].id;
        setGroup(defaultOrgId);
        fetchMembers(defaultOrgId);
      }
    }
  }, [isOrgListLoaded, userMemberships.data, group, fetchMembers]);

  const handleGroupChange = useCallback((orgId: string) => {
    setGroup(orgId);
    fetchMembers(orgId);
    setRequestTo(null);
  }, [fetchMembers]);

  const handleRequestToSelect = useCallback((value: string) => {
    const selectedMember = members.find((member) => member.id === value);
    if (selectedMember) {
      setRequestTo(selectedMember);
    }
  }, [members]);

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
        id: requestTo.id, 
        email: requestTo.email 
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

  if (!isUserLoaded || !isOrgListLoaded || !isOrgLoaded) {
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
          {organizations.length > 0 ? (
            <Select onValueChange={handleGroupChange} value={group} required>
              <SelectTrigger id="group" className="w-full">
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
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
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="w-full">
          Send Request
        </Button>
      </form>
    </div>
  );
}