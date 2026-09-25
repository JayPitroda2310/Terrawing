import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/utils/helpers/logger';

interface AssetBoundaryProps {
  name: string;
  fallback: ReactNode;
  children: ReactNode;
}

/** Renders a fallback when an asset (model, texture) fails to load, instead of crashing the game. */
export class AssetBoundary extends Component<AssetBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(
      'assets',
      `Failed to load ${this.props.name}; using fallback.`,
      error,
      info.componentStack,
    );
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
