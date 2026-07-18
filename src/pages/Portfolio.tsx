import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Loader, TrendingUp, TrendingDown, DollarSign, Briefcase, Plus,
  Download, Lock, FolderPlus, Trash2, Pencil, Star,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio, PositionWithCurrentPrice } from '@/hooks/usePortfolio';
import {
  usePortfolios,
  useCreatePortfolio,
  useDeletePortfolio,
  useRenamePortfolio,
  useSetDefaultPortfolio,
  useMovePosition,
} from '@/hooks/usePortfolios';
import AddPositionForm from '@/components/AddPositionForm';
import PositionCard from '@/components/PositionCard';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import CurrencySelector from '@/components/CurrencySelector';
import { useCurrency } from '@/hooks/useCurrency';
import PremiumPaywall from '@/components/PremiumPaywall';
import { limitsFor } from '@/utils/tiers';
import { downloadCsv } from '@/utils/csvExport';

const Portfolio = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const tier = auth?.tier ?? 'free';
  const limits = limitsFor(tier);
  const { data: portfolios = [] } = usePortfolios();
  const createPortfolio = useCreatePortfolio();
  const deletePortfolio = useDeletePortfolio();
  const renamePortfolio = useRenamePortfolio();
  const setDefaultPortfolio = useSetDefaultPortfolio();
  const movePosition = useMovePosition();

  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedPortfolioId && portfolios.length > 0) {
      setSelectedPortfolioId(portfolios.find((p) => p.is_default)?.id ?? portfolios[0].id);
    }
  }, [portfolios, selectedPortfolioId]);

  const { positions, loading, portfolioSummary, deletePosition } = usePortfolio(selectedPortfolioId);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PositionWithCurrentPrice | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [newPortfolioOpen, setNewPortfolioOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { formatConvertedPrice, selectedCurrency } = useCurrency();

  const portfolioLimit = limits.portfolios;
  const portfolioCount = portfolios.length;
  const atPortfolioLimit = portfolioCount >= portfolioLimit;
  const selectedPortfolio = portfolios.find((p) => p.id === selectedPortfolioId);

  const handleNewPortfolio = () => {
    if (atPortfolioLimit) {
      setPaywallOpen(true);
      return;
    }
    setNewPortfolioOpen(true);
  };

  const handleCreatePortfolio = async () => {
    const name = newPortfolioName.trim();
    if (!name) return;
    const created = await createPortfolio.mutateAsync(name);
    setNewPortfolioName('');
    setNewPortfolioOpen(false);
    if (created?.id) setSelectedPortfolioId(created.id);
  };

  const handleDeletePortfolio = async () => {
    if (!selectedPortfolio || selectedPortfolio.is_default) return;
    if (positions.length > 0) {
      setConfirmDeleteOpen(true);
      return;
    }
    await deletePortfolio.mutateAsync(selectedPortfolio.id);
    setSelectedPortfolioId(portfolios.find((p) => p.is_default)?.id);
  };

  const confirmDeletePortfolio = async () => {
    if (!selectedPortfolio) return;
    await deletePortfolio.mutateAsync(selectedPortfolio.id);
    setConfirmDeleteOpen(false);
    setSelectedPortfolioId(portfolios.find((p) => p.is_default)?.id);
  };

  const handleRenamePortfolio = async () => {
    if (!selectedPortfolio) return;
    const name = renameValue.trim();
    if (!name || name === selectedPortfolio.name) {
      setRenameOpen(false);
      return;
    }
    await renamePortfolio.mutateAsync({ id: selectedPortfolio.id, name });
    setRenameOpen(false);
  };

  const openRename = () => {
    if (!selectedPortfolio) return;
    setRenameValue(selectedPortfolio.name);
    setRenameOpen(true);
  };

  const handleSetDefault = async () => {
    if (!selectedPortfolio || selectedPortfolio.is_default) return;
    await setDefaultPortfolio.mutateAsync(selectedPortfolio.id);
  };

  const handleMovePosition = async (positionId: string, toPortfolioId: string) => {
    await movePosition.mutateAsync({ positionId, toPortfolioId });
  };

  const handleExportCsv = () => {
    if (!limits.csvExport) {
      setPaywallOpen(true);
      return;
    }
    downloadCsv(
      `${selectedPortfolio?.name ?? 'portfolio'}.csv`,
      ['Commodity', 'Quantity', 'Entry Price', 'Entry Date', 'Current Price', 'Current Value', 'Return', 'Return %', 'Notes'],
      positions.map((p) => [
        p.commodity_name, p.quantity, p.entry_price, p.entry_date,
        p.current_price, p.current_value, p.total_return,
        p.return_percentage.toFixed(2), p.notes ?? '',
      ]),
    );
  };

  const formatCurrency = (amount: number) => {
    return formatConvertedPrice(amount);
  };

  const formatPercentage = (percentage: number) => {
    return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader className="w-6 h-6 animate-spin text-primary" />
          <span className="text-muted-foreground">Loading your portfolio...</span>
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-background">
        <MobilePageHeader
          title="My Portfolio"
          subtitle="Track your commodity positions and performance"
        >
          <div className="flex items-center gap-2">
            <CurrencySelector compact />
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="gap-2 touch-manipulation"
              disabled={positions.length === 0}
            >
              {limits.csvExport ? <Download className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
            <Button 
              onClick={() => setShowAddForm(true)} 
              className="gap-2 touch-manipulation"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Position</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </MobilePageHeader>
        
        <div className="container mx-auto px-4 py-6 max-w-7xl">

      {/* Portfolio selector */}
      <Card className="mb-6">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Briefcase className="w-4 h-4 text-muted-foreground" />
          <div className="flex-1 min-w-[200px]">
            <Select value={selectedPortfolioId} onValueChange={setSelectedPortfolioId}>
              <SelectTrigger>
                <SelectValue placeholder="Select portfolio" />
              </SelectTrigger>
              <SelectContent>
                {portfolios.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.is_default ? ' (Default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="outline" className="text-xs">
            {portfolioCount}/{portfolioLimit === Infinity ? '∞' : portfolioLimit} portfolios
          </Badge>
          <Button variant="outline" size="sm" onClick={handleNewPortfolio} className="gap-1">
            {atPortfolioLimit ? <Lock className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
            New
          </Button>
          {selectedPortfolio && (
            <Button variant="ghost" size="sm" onClick={openRename} className="gap-1">
              <Pencil className="w-4 h-4" />
              Rename
            </Button>
          )}
          {selectedPortfolio && !selectedPortfolio.is_default && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSetDefault}
              className="gap-1"
              disabled={setDefaultPortfolio.isPending}
            >
              <Star className="w-4 h-4" />
              Make default
            </Button>
          )}
          {selectedPortfolio && !selectedPortfolio.is_default && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeletePortfolio}
              className="gap-1 text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          )}
          {atPortfolioLimit && (
            <Badge variant="outline" className="text-[10px] uppercase">
              {tier === 'free' ? 'Free: 1 · Premium: 3 · Pro: ∞' : tier === 'premium' ? 'Premium: 3 · Pro: ∞' : ''}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950/20">
                <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-xl font-bold">
                  {formatCurrency(portfolioSummary.totalValue)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-950/20">
                <Briefcase className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cost Basis</p>
                <p className="text-xl font-bold">
                  {formatCurrency(portfolioSummary.totalCost)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                portfolioSummary.isPositive 
                  ? 'bg-green-100 dark:bg-green-950/20' 
                  : 'bg-red-100 dark:bg-red-950/20'
              }`}>
                {portfolioSummary.isPositive ? (
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Return</p>
                <p className={`text-xl font-bold ${
                  portfolioSummary.isPositive 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatCurrency(Math.abs(portfolioSummary.totalReturn))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                portfolioSummary.isPositive 
                  ? 'bg-green-100 dark:bg-green-950/20' 
                  : 'bg-red-100 dark:bg-red-950/20'
              }`}>
                {portfolioSummary.isPositive ? (
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Return %</p>
                <p className={`text-xl font-bold ${
                  portfolioSummary.isPositive 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatPercentage(portfolioSummary.returnPercentage)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Positions */}
      {positions.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <Briefcase className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-xl font-semibold mb-2">No Positions Yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Start building your commodity portfolio by adding your first position. 
              Track performance and stay updated with real-time prices.
            </p>
            <Button onClick={() => setShowAddForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Your First Position
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Your Positions</h2>
            <p className="text-sm text-muted-foreground">
              {positions.length} position{positions.length !== 1 ? 's' : ''}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {positions.map((position) => (
              <PositionCard
                key={position.id}
                position={position}
                onEdit={setEditingPosition}
                onDelete={deletePosition}
                portfolios={portfolios}
                onMove={handleMovePosition}
              />
            ))}
          </div>
        </div>
      )}

      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Position</DialogTitle>
          </DialogHeader>
          <AddPositionForm
            portfolioId={selectedPortfolioId}
            onSuccess={() => setShowAddForm(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPosition} onOpenChange={() => setEditingPosition(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Position</DialogTitle>
          </DialogHeader>
          <div className="p-4 text-center text-muted-foreground">
            Edit functionality coming soon...
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newPortfolioOpen} onOpenChange={setNewPortfolioOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create new portfolio</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="pname">Portfolio name</Label>
            <Input
              id="pname"
              value={newPortfolioName}
              onChange={(e) => setNewPortfolioName(e.target.value)}
              placeholder="e.g., Energy Long-Term"
              maxLength={64}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setNewPortfolioOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreatePortfolio}
                disabled={!newPortfolioName.trim() || createPortfolio.isPending}
              >
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename portfolio</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="rname">New name</Label>
            <Input
              id="rname"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={64}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
              <Button
                onClick={handleRenamePortfolio}
                disabled={!renameValue.trim() || renamePortfolio.isPending}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete portfolio with positions?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            "{selectedPortfolio?.name}" has {positions.length} position{positions.length === 1 ? '' : 's'}.
            Deleting the portfolio will permanently remove these positions too.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeletePortfolio} disabled={deletePortfolio.isPending}>
              Delete everything
            </Button>
          </div>
        </DialogContent>
      </Dialog>
        </div>
      </div>
    
  );
};

export default Portfolio;
