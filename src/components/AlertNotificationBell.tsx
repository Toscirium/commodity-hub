import React from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import {
  useUndismissedTriggers,
  useDismissTrigger,
} from "@/hooks/usePriceAlerts";

const AlertNotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: triggers = [] } = useUndismissedTriggers();
  const dismiss = useDismissTrigger();
  const count = triggers.length;

  if (!auth?.user) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Price alerts">
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold">Price alerts</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate("/alerts")}
          >
            Manage
          </Button>
        </div>
        {count === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground text-center">
            No new alerts.
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y">
            {triggers.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.commodity_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Went {t.condition} ${t.target_price} — now ${t.triggered_price}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(t.triggered_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={t.condition === "above" ? "default" : "secondary"} className="text-[10px]">
                    {t.condition}
                  </Badge>
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => dismiss.mutate(t.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default AlertNotificationBell;