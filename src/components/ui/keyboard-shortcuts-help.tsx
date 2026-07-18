import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Keyboard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: { [category: string]: { [key: string]: { description: string } } };
}

const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  isOpen,
  onClose,
  shortcuts
}) => {
  const formatKeySequence = (key: string) => {
    if (key.includes(' ')) {
      return key.split(' ').map((k, index) => (
        <span key={`${k}-${index}`} className="inline-flex items-center">
          {index > 0 && <span className="text-muted-foreground mx-1">then</span>}
          <kbd className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded">
            {k.toUpperCase()}
          </kbd>
        </span>
      ));
    }
    
    const displayKey = key === '/' ? 'Slash' : 
                       key === '?' ? 'Shift + /' :
                       key === 'Escape' ? 'Esc' : 
                       key.toUpperCase();
    
    return (
      <kbd className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded">
        {displayKey}
      </kbd>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-5 h-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {Object.entries(shortcuts).map(([category, categoryShortcuts]) => (
            <div
              key={category}
              className="space-y-3 animate-fade-in-up"
            >
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">{category}</h3>
                <Badge variant="outline" className="text-xs">
                  {Object.keys(categoryShortcuts).length} shortcuts
                </Badge>
              </div>
              
              <div className="grid gap-2">
                {Object.entries(categoryShortcuts).map(([key, action]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm font-medium">{action.description}</span>
                    <div className="flex items-center gap-1">
                      {formatKeySequence(key)}
                    </div>
                  </div>
                ))}
              </div>
              
              {category !== Object.keys(shortcuts)[Object.keys(shortcuts).length - 1] && (
                <Separator className="my-4" />
              )}
            </div>
          ))}
          
          <div className="p-4 rounded-lg bg-muted/30 border border-dashed">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Keyboard className="w-4 h-4 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="font-medium text-sm">Pro Tips</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Shortcuts don't work while typing in input fields</li>
                  <li>• Press <kbd className="px-1 py-0.5 text-xs bg-muted border rounded">Esc</kbd> to close dialogs or clear focus</li>
                  <li>• Multi-key sequences like "g d" have a 2-second timeout</li>
                  <li>• Press <kbd className="px-1 py-0.5 text-xs bg-muted border rounded">?</kbd> anytime to see this help</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardShortcutsHelp;