'use client';

import 'maplibre-gl/dist/maplibre-gl.css';

import { Loader2, Locate, Maximize, Minus, Plus } from 'lucide-react';
import * as MapLibreGL from 'maplibre-gl';
import React from 'react';

import { cn } from '@/lib/utils';

if (typeof window !== 'undefined' && !MapLibreGL.getWorkerUrl()) {
  MapLibreGL.setWorkerUrl(
    `https://unpkg.com/maplibre-gl@${MapLibreGL.getVersion()}/dist/maplibre-gl-worker.mjs`,
  );
}

const defaultStyles = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

const blankMapStyle: MapLibreGL.StyleSpecification = {
  layers: [
    {
      id: 'background',
      paint: { 'background-color': 'rgba(0, 0, 0, 0)' },
      type: 'background',
    },
  ],
  sources: {},
  version: 8,
};

type Theme = 'dark' | 'light';
type MapStyleOption = MapLibreGL.StyleSpecification | string;

interface MapViewport {
  bearing: number;
  center: [number, number];
  pitch: number;
  zoom: number;
}

interface MapProps extends Omit<MapLibreGL.MapOptions, 'container' | 'style'> {
  blank?: boolean;
  children?: React.ReactNode;
  className?: string;
  loading?: boolean;
  onViewportChange?: (viewport: MapViewport) => void;
  styles?: {
    dark?: MapStyleOption;
    light?: MapStyleOption;
  };
  theme?: Theme;
  viewport?: Partial<MapViewport>;
}

interface MapControlsProps {
  className?: string;
  onLocate?: (coordinates: { latitude: number; longitude: number }) => void;
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  showFullscreen?: boolean;
  showLocate?: boolean;
  showZoom?: boolean;
}

const MapContext = React.createContext<MapLibreGL.Map | null>(null);

const useMap = () => {
  const context = React.useContext(MapContext);

  if (context === null) {
    throw new Error('useMap must be used within a Map component');
  }

  return context;
};

const documentTheme = (): Theme | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const root = document.documentElement;
  if (root.classList.contains('dark')) {
    return 'dark';
  }
  if (root.classList.contains('light')) {
    return 'light';
  }

  const { theme } = root.dataset;
  return theme === 'dark' || theme === 'light' ? theme : null;
};

const systemTheme = (): Theme =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

const useResolvedTheme = (theme?: Theme) => {
  const [detectedTheme, setDetectedTheme] = React.useState(
    () => documentTheme() ?? systemTheme(),
  );

  React.useEffect(() => {
    if (theme !== undefined) {
      return () => {
        // Controlled themes do not register external listeners.
      };
    }

    const root = document.documentElement;
    const updateTheme = () => {
      setDetectedTheme(documentTheme() ?? systemTheme());
    };
    const observer = new MutationObserver(updateTheme);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    observer.observe(root, {
      attributeFilter: ['class', 'data-theme'],
      attributes: true,
    });
    mediaQuery.addEventListener('change', updateTheme);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', updateTheme);
    };
  }, [theme]);

  return theme ?? detectedTheme;
};

const viewportFrom = (map: MapLibreGL.Map): MapViewport => {
  const center = map.getCenter();
  return {
    bearing: map.getBearing(),
    center: [center.lng, center.lat],
    pitch: map.getPitch(),
    zoom: map.getZoom(),
  };
};

const Map = ({
  blank = false,
  children,
  className,
  loading = false,
  onViewportChange,
  styles,
  theme,
  viewport,
  ...options
}: MapProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [map, setMap] = React.useState<MapLibreGL.Map | null>(null);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const resolvedTheme = useResolvedTheme(theme);
  const darkStyle =
    styles?.dark ?? (blank ? blankMapStyle : defaultStyles.dark);
  const lightStyle =
    styles?.light ?? (blank ? blankMapStyle : defaultStyles.light);
  const style = resolvedTheme === 'dark' ? darkStyle : lightStyle;
  const initialOptions = React.useRef(options);
  const initialStyle = React.useRef(style);
  const onViewportChangeEvent = React.useEffectEvent(
    (nextViewport: MapViewport) => onViewportChange?.(nextViewport),
  );

  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return () => {
        // Nothing was initialized, so cleanup has no work to do.
      };
    }

    const instance = new MapLibreGL.Map({
      ...initialOptions.current,
      container,
      style: initialStyle.current,
    });
    const handleLoad = () => {
      setIsLoaded(true);
    };
    const handleMove = () => {
      onViewportChangeEvent(viewportFrom(instance));
    };

    instance.on('load', handleLoad);
    instance.on('move', handleMove);
    setMap(instance);

    return () => {
      instance.off('load', handleLoad);
      instance.off('move', handleMove);
      instance.remove();
    };
  }, []);

  React.useEffect(() => {
    if (map !== null && map.getStyle() !== style) {
      map.setStyle(style);
      map.once('style.load', () => {
        setIsLoaded(true);
      });
    }
  }, [map, style]);

  React.useEffect(() => {
    if (map === null || viewport === undefined || map.isMoving()) {
      return;
    }

    map.jumpTo(viewport);
  }, [map, viewport]);

  return (
    <MapContext.Provider value={map}>
      <div
        ref={containerRef}
        className={cn('relative h-full w-full', className)}
      >
        {(!isLoaded || loading) && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/50">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {map === null ? null : children}
      </div>
    </MapContext.Provider>
  );
};

const positionClasses = {
  'bottom-left': 'bottom-2 left-2',
  'bottom-right': 'bottom-10 right-2',
  'top-left': 'top-2 left-2',
  'top-right': 'top-2 right-2',
};

const ControlGroup = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col overflow-hidden border border-border bg-background shadow-sm [&>button:not(:last-child)]:border-b">
    {children}
  </div>
);

const ControlButton = ({
  children,
  disabled = false,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    aria-label={label}
    className="flex size-8 items-center justify-center transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50"
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

const MapControls = ({
  className,
  onLocate,
  position = 'bottom-right',
  showFullscreen = false,
  showLocate = false,
  showZoom = true,
}: MapControlsProps) => {
  const map = useMap();
  const [locating, setLocating] = React.useState(false);

  const locate = () => {
    if (!('geolocation' in navigator)) {
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const coordinates = {
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        map?.flyTo({
          center: [coordinates.longitude, coordinates.latitude],
          duration: 1500,
          zoom: 14,
        });
        onLocate?.(coordinates);
        setLocating(false);
      },
      () => {
        setLocating(false);
      },
      { timeout: 10_000 },
    );
  };

  return (
    <div
      className={cn(
        'absolute z-10 flex flex-col gap-1.5',
        positionClasses[position],
        className,
      )}
    >
      {showZoom && (
        <ControlGroup>
          <ControlButton
            label="Perbesar peta"
            onClick={() => {
              map?.zoomTo(map.getZoom() + 1, { duration: 300 });
            }}
          >
            <Plus className="size-4" />
          </ControlButton>
          <ControlButton
            label="Perkecil peta"
            onClick={() => {
              map?.zoomTo(map.getZoom() - 1, { duration: 300 });
            }}
          >
            <Minus className="size-4" />
          </ControlButton>
        </ControlGroup>
      )}
      {showLocate && (
        <ControlGroup>
          <ControlButton
            disabled={locating}
            label="Cari lokasi saya"
            onClick={locate}
          >
            {locating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Locate className="size-4" />
            )}
          </ControlButton>
        </ControlGroup>
      )}
      {showFullscreen && (
        <ControlGroup>
          <ControlButton
            label="Layar penuh"
            onClick={() => {
              const container = map?.getContainer();
              if (container === undefined) {
                return;
              }
              if (document.fullscreenElement === null) {
                void container.requestFullscreen();
              } else {
                void document.exitFullscreen();
              }
            }}
          >
            <Maximize className="size-4" />
          </ControlButton>
        </ControlGroup>
      )}
    </div>
  );
};

export { Map, MapControls, useMap };
export type { MapControlsProps, MapProps, MapStyleOption, MapViewport };
