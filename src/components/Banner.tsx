import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Banner() {
  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-600" />
      <div className="relative flex flex-col items-center justify-center py-32 px-6 sm:py-40 sm:px-12 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-4 text-gray-900 p-4">
          SettleUp your expenses with friends in seconds
        </h1>
        <Link href="/group">
          <Button
            size="lg"
            className="bg-purple-600 text-white text-lg sm:text-xl md:text-2xl lg:text-3xl p-8"
          >
            Get Started
          </Button>
        </Link>
      </div>
    </div>
  );
}