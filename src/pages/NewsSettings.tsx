import React from 'react';
import { useNavigate } from 'react-router-dom';
import NewsSettings from '@/components/NewsSettings';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';

const NewsSettingsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile-optimized header */}
      <MobilePageHeader
        title="News Configuration"
        subtitle="Configure API keys and settings for enhanced news coverage across multiple sources"
      />
      
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Settings Component */}
        <NewsSettings />
      </div>
    </div>
  );
};

export default NewsSettingsPage;