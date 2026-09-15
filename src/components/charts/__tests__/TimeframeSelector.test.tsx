import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TimeframeSelector from '../TimeframeSelector';
import { TIMEFRAMES } from '../chartUtils';

describe('TimeframeSelector', () => {
  it('renders every option as a tab and marks the active one selected', () => {
    render(<TimeframeSelector options={TIMEFRAMES} value="1m" onChange={vi.fn()} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(TIMEFRAMES.length);

    const active = screen.getByRole('tab', { name: '1M' });
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active).toHaveAttribute('tabIndex', '0');

    const inactive = screen.getByRole('tab', { name: '1D' });
    expect(inactive).toHaveAttribute('aria-selected', 'false');
    expect(inactive).toHaveAttribute('tabIndex', '-1');
  });

  it('calls onChange when a different option is clicked', () => {
    const onChange = vi.fn();
    render(<TimeframeSelector options={TIMEFRAMES} value="1m" onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: '1Y' }));
    expect(onChange).toHaveBeenCalledWith('1y');
  });

  it('does not fire onChange when disabled', () => {
    const onChange = vi.fn();
    render(<TimeframeSelector options={TIMEFRAMES} value="1m" onChange={onChange} disabled />);

    fireEvent.click(screen.getByRole('tab', { name: '1Y' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: '1Y' })).toBeDisabled();
  });

  it('supports arrow-key navigation between tabs', () => {
    const onChange = vi.fn();
    render(<TimeframeSelector options={TIMEFRAMES} value="1m" onChange={onChange} />);

    const active = screen.getByRole('tab', { name: '1M' });
    fireEvent.keyDown(active, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('3m');

    fireEvent.keyDown(active, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('1d');
  });
});
