'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchIcon, MessageCircleIcon } from 'lucide-react';
import Image from 'next/image';

export default function Sidebar() {
  const pathname = usePathname();

  const navigation = [
    { name: 'Information Booth', href: '/', icon: MessageCircleIcon },
    { name: 'Search', href: '/search', icon: SearchIcon },
  ];

  return (
    <div className="w-64 bg-dark-950 text-white flex flex-col">
      <div className="p-6 border-b bg-white border-dark-800">
        <div className="flex items-center">
          <Image 
            src="/fairgrounds_banner.jpg" 
            alt="Fairgrounds Logo" 
            width={180} 
            height={37}
            className="rounded object-contain"
          />
        </div>
      </div>
      
      <nav className="flex-1 px-4 py-6">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-500 text-white'
                      : 'text-gray-300 hover:bg-dark-800 hover:text-white'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}