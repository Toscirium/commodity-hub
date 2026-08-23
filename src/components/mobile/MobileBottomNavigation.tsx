import { Bell, CircleUserRound, LayoutDashboard, LineChart, MessageCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVirtualKeyboard } from '@/hooks/useVirtualKeyboard';

const items = [
  { label: 'Today', path: '/today', icon: LayoutDashboard },
  { label: 'Markets', path: '/dashboard', icon: LineChart },
  { label: 'Alerts', path: '/alerts', icon: Bell },
  { label: 'Messages', path: '/messages', icon: MessageCircle },
  { label: 'More', path: '/account-settings', icon: CircleUserRound },
];

/** Primary navigation for the native-sized experience. Desktop retains the sidebar. */
const MobileBottomNavigation = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const keyboard = useVirtualKeyboard();

  // The nav is `position: fixed; bottom: 0; z-index: 70`, so with the soft
  // keyboard open it lands on top of whatever the user is typing into — most
  // visibly the Messages composer. Nobody is tapping nav items mid-compose,
  // so it gets out of the way until the keyboard closes.
  if (!isMobile || location.pathname === '/auth' || keyboard.isVisible) return null;

  return (
    <nav className="mobile-bottom-nav safe-area-bottom" aria-label="Primary navigation">
      {items.map(({ label, path, icon: Icon }) => {
        const active = location.pathname === path || (path === '/today' && location.pathname === '/');
        return (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            className={active ? 'is-active' : ''}
            aria-current={active ? 'page' : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileBottomNavigation;
