/**
 * React wrapper around uPlot.
 *
 * Design notes:
 * - On `options` identity change, we destroy and recreate the plot. uPlot
 *   mutates its opts internally and exposes no generic "reconfigure" API, so
 *   a full rebuild is the simplest correct strategy. Callers that want to
 *   avoid rebuilds should memoize `options` themselves.
 * - On `data` identity change (with same `options` identity) we call
 *   `plot.setData(data)` to skip the rebuild.
 * - Container width is tracked with a ResizeObserver; height defaults to
 *   `options.height` or 300.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface UPlotChartProps {
  options: uPlot.Options;
  data: uPlot.AlignedData;
  className?: string;
  onReady?: (plot: uPlot) => void;
  /**
   * When true, chart height tracks the container's measured height instead of
   * `options.height`. Use this when the chart sits inside a flex layout where
   * the container's dimensions are driven by CSS, not props.
   */
  fillHeight?: boolean;
}

export const UPlotChart = forwardRef<HTMLDivElement, UPlotChartProps>(
  function UPlotChart({ options, data, className, onReady, fillHeight }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const plotRef = useRef<uPlot | null>(null);
    // Latest props captured by ref so effects can read current values without
    // re-running when only a callback identity changes.
    const onReadyRef = useRef<typeof onReady>(onReady);
    const dataRef = useRef<uPlot.AlignedData>(data);

    useImperativeHandle(ref, () => containerRef.current as HTMLDivElement, []);

    useEffect(() => {
      onReadyRef.current = onReady;
    }, [onReady]);

    useEffect(() => {
      dataRef.current = data;
    }, [data]);

    // (Re)create the plot whenever `options` identity changes.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth || 600;
      const measuredHeight = container.clientHeight;
      const height = fillHeight && measuredHeight > 0
        ? measuredHeight
        : options.height || 300;

      const merged: uPlot.Options = {
        ...options,
        width,
        height,
      };

      const plot = new uPlot(merged, dataRef.current, container);
      plotRef.current = plot;
      onReadyRef.current?.(plot);

      // Auto-size to container. Width always tracks; height tracks only when
      // `fillHeight` is set, otherwise stays pinned to options.height.
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const w = Math.round(entry.contentRect.width);
        const h = Math.round(entry.contentRect.height);
        if (w > 0 && plotRef.current) {
          plotRef.current.setSize({
            width: w,
            height: fillHeight && h > 0 ? h : plotRef.current.height,
          });
        }
      });
      ro.observe(container);

      return () => {
        ro.disconnect();
        plot.destroy();
        plotRef.current = null;
      };
    }, [options, fillHeight]);

    // Push new data without rebuilding when only data changed.
    useEffect(() => {
      const plot = plotRef.current;
      if (!plot) return;
      plot.setData(data);
    }, [data]);

    return <div ref={containerRef} className={className} />;
  },
);
