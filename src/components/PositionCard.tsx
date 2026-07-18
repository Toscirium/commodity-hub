import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MoreVertical, TrendingUp, TrendingDown, Calendar, Hash, Edit, Trash2, FolderInput } from 'lucide-react';
import { PositionWithCurrentPrice } from '@/hooks/usePortfolio';
import { useCurrency } from '@/hooks/useCurrency';

interface PositionCardProps {
  position: PositionWithCurrentPrice;
  onEdit?: (position: PositionWithCurrentPrice) => void;
  onDelete?: (id: string) => void;
  portfolios?: Array<{ id: string; name: string }>;
  onMove?: (positionId: string, toPortfolioId: string) => void;
}

const PositionCard: React.FC<PositionCardProps> = ({ position, onEdit, onDelete, portfolios = [], onMove }) => {
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const { formatConvertedPrice } = useCurrency();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`;
  };

  const formatCurrency = (amount: number) => {
    return formatConvertedPrice(amount);
  };

  return (
    <>
      <Card className="transition-all duration-200 hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg font-bold text-foreground">
                {position.commodity_name}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  <Hash className="w-3 h-3 mr-1" />
                  {position.quantity}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <Calendar className="w-3 h-3 mr-1" />
                  {formatDate(position.entry_date)}
                </Badge>
              </div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit?.(position)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Position
                </DropdownMenuItem>
                {onMove && portfolios.filter((p) => p.id !== position.portfolio_id).length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderInput className="w-4 h-4 mr-2" />
                      Move to…
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {portfolios
                        .filter((p) => p.id !== position.portfolio_id)
                        .map((p) => (
                          <DropdownMenuItem key={p.id} onClick={() => onMove(position.id, p.id)}>
                            {p.name}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-600 dark:text-red-400"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Position
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Entry Price</p>
              <p className="text-sm font-semibold">{formatConvertedPrice(position.entry_price)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Current Price</p>
              <p className="text-sm font-semibold">{formatConvertedPrice(position.current_price)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Position Value</p>
              <p className="text-sm font-semibold">{formatCurrency(position.current_value)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Cost Basis</p>
              <p className="text-sm font-semibold">{formatCurrency(position.quantity * position.entry_price)}</p>
            </div>
          </div>

          <div className={`p-3 rounded-lg border ${
            position.is_positive 
              ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
              : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {position.is_positive ? (
                  <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                )}
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {position.is_positive ? 'Gain' : 'Loss'}
                </span>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${
                  position.is_positive 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatCurrency(Math.abs(position.total_return))}
                </p>
                <p className={`text-xs font-semibold ${
                  position.is_positive 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatPercentage(position.return_percentage)}
                </p>
              </div>
            </div>
          </div>

          {position.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-muted-foreground">{position.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Position</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete your {position.commodity_name} position? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => onDelete?.(position.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete Position
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PositionCard;
