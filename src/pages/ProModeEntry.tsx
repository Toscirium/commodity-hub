import React from 'react';
import { Navigate } from 'react-router-dom';
import { useProView } from '@/contexts/ProViewContext';

/**
 * /pro — the link to send a prospect. Turns on the professional view for
 * this device (see ProViewContext) and lands on the normal home route.
 * No visible UI of its own; it's a one-time switch, not a page.
 */
const ProModeEntry: React.FC = () => {
  const { setProView } = useProView();

  React.useEffect(() => {
    setProView(true);
  }, [setProView]);

  return <Navigate to="/" replace />;
};

export default ProModeEntry;
