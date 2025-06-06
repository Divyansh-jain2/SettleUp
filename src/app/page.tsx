'use client';

import React from 'react';
import { Users, UserPlus, LineChart } from 'lucide-react';
import Banner from '@/components/Banner';
import FeatureCard from '@/components/FeatureCard';

export default function LandingPage() {
  return (
    <div className="h-screen w-screen overflow-hidden text-gray-900">
      {/* Hero Section */}
      <Banner />
    </div>
  );
}