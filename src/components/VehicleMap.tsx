import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Play, Pause, RotateCcw, MapPin, Clock, Gauge } from 'lucide-react';
import { toast } from 'sonner';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: string;
}

const VehicleMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const vehicleMarker = useRef<L.Marker | null>(null);
  const routeLine = useRef<L.Polyline | null>(null);
  const activeLine = useRef<L.Polyline | null>(null);
  
  const [routeData, setRouteData] = useState<RoutePoint[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<RoutePoint | null>(null);
  const [speed, setSpeed] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load route data
  useEffect(() => {
    fetch('/dummy-route.json')
      .then(response => response.json())
      .then((data: RoutePoint[]) => {
        setRouteData(data);
        if (data.length > 0) {
          setCurrentPosition(data[0]);
        }
        toast.success('Route data loaded successfully!');
      })
      .catch(error => {
        console.error('Error loading route data:', error);
        toast.error('Failed to load route data');
      });
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !routeData.length || map.current) return;

    // Initialize Leaflet map
    map.current = L.map(mapContainer.current).setView(
      [routeData[0].latitude, routeData[0].longitude], 
      15
    );

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map.current);

    // Create custom vehicle icon
    const vehicleIcon = L.divIcon({
      html: `
        <div style="
          width: 24px; 
          height: 24px; 
          background: #00bfff; 
          border: 3px solid white; 
          border-radius: 50%; 
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: pulse 2s infinite;
        ">
          <div style="
            width: 8px; 
            height: 8px; 
            background: white; 
            border-radius: 50%;
          "></div>
        </div>
        <style>
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.8; }
          }
        </style>
      `,
      className: 'vehicle-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    // Add vehicle marker
    vehicleMarker.current = L.marker(
      [routeData[0].latitude, routeData[0].longitude],
      { icon: vehicleIcon }
    ).addTo(map.current);

    // Add complete route line (gray)
    const routeCoordinates: L.LatLngExpression[] = routeData.map(point => [point.latitude, point.longitude]);
    routeLine.current = L.polyline(routeCoordinates, {
      color: '#94a3b8',
      weight: 4,
      opacity: 0.6
    }).addTo(map.current);

    // Add active route line (blue)
    activeLine.current = L.polyline([], {
      color: '#00bfff',
      weight: 6,
      opacity: 1
    }).addTo(map.current);

    // Fit map to route bounds
    const bounds = L.latLngBounds(routeCoordinates);
    map.current.fitBounds(bounds, { padding: [20, 20] });

    toast.success('Map loaded successfully!');

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [routeData]);

  // Vehicle movement simulation
  useEffect(() => {
    if (isPlaying && routeData.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex(prevIndex => {
          const nextIndex = prevIndex + 1;
          if (nextIndex >= routeData.length) {
            setIsPlaying(false);
            toast.success('Route completed!');
            return prevIndex;
          }

          const currentPoint = routeData[nextIndex];
          setCurrentPosition(currentPoint);

          // Update vehicle marker position
          if (vehicleMarker.current) {
            vehicleMarker.current.setLatLng([currentPoint.latitude, currentPoint.longitude]);
          }

          // Update active route
          if (activeLine.current) {
            const activeCoordinates: L.LatLngExpression[] = routeData
              .slice(0, nextIndex + 1)
              .map(point => [point.latitude, point.longitude]);
            activeLine.current.setLatLngs(activeCoordinates);
          }

          // Pan map to follow vehicle
          if (map.current) {
            map.current.panTo([currentPoint.latitude, currentPoint.longitude]);
          }

          // Calculate speed
          if (nextIndex > 0) {
            const prevPoint = routeData[nextIndex - 1];
            const currentTime = new Date(currentPoint.timestamp).getTime();
            const prevTime = new Date(prevPoint.timestamp).getTime();
            const timeDiff = (currentTime - prevTime) / 1000; // seconds
            
            const distance = calculateDistance(
              prevPoint.latitude, prevPoint.longitude,
              currentPoint.latitude, currentPoint.longitude
            );
            
            const calculatedSpeed = distance / timeDiff * 3.6; // km/h
            setSpeed(Math.round(calculatedSpeed * 100) / 100);
          }

          // Update elapsed time
          const startTime = new Date(routeData[0].timestamp).getTime();
          const currentTime = new Date(currentPoint.timestamp).getTime();
          setElapsedTime(Math.round((currentTime - startTime) / 1000));

          return nextIndex;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, routeData]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1000; // Distance in meters
  };

  const handlePlay = () => {
    if (currentIndex >= routeData.length - 1) {
      handleReset();
    }
    setIsPlaying(true);
    toast.info('Vehicle movement started');
  };

  const handlePause = () => {
    setIsPlaying(false);
    toast.info('Vehicle movement paused');
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
    setElapsedTime(0);
    setSpeed(0);
    
    if (routeData.length > 0) {
      setCurrentPosition(routeData[0]);
      
      if (vehicleMarker.current) {
        vehicleMarker.current.setLatLng([routeData[0].latitude, routeData[0].longitude]);
      }

      if (activeLine.current) {
        activeLine.current.setLatLngs([]);
      }

      if (map.current) {
        map.current.setView([routeData[0].latitude, routeData[0].longitude], 15);
      }
    }
    
    toast.info('Vehicle position reset');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card/95 backdrop-blur-sm border-b border-accent/20 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Vehicle Tracking System</h1>
          
          {/* Controls */}
          <div className="flex items-center gap-2">
            <Button
              onClick={isPlaying ? handlePause : handlePlay}
              variant="default"
              className="bg-gradient-to-r from-primary to-accent animate-glow"
              disabled={!routeData.length}
            >
              {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            <Button onClick={handleReset} variant="secondary" disabled={!routeData.length}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Map */}
        <div className="flex-1 relative">
          <div ref={mapContainer} className="w-full h-full" />
          {!routeData.length && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
              <div className="text-center">
                <div className="text-lg font-semibold text-foreground mb-2">Loading route data...</div>
                <div className="text-muted-foreground">Please wait while we load the vehicle tracking data</div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-card/95 backdrop-blur-sm border-l border-accent/20 p-4 space-y-4 overflow-y-auto">
          {/* Current Position */}
          <Card className="p-4 bg-gradient-to-br from-secondary/50 to-accent/10 border-accent/20">
            <div className="flex items-center gap-3 mb-3">
              <MapPin className="w-5 h-5 text-vehicle" />
              <h3 className="font-semibold text-foreground">Current Position</h3>
            </div>
            {currentPosition && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Latitude:</span>
                  <span className="font-mono text-foreground">{currentPosition.latitude.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Longitude:</span>
                  <span className="font-mono text-foreground">{currentPosition.longitude.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Timestamp:</span>
                  <span className="font-mono text-foreground text-xs">
                    {new Date(currentPosition.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Speed */}
          <Card className="p-4 bg-gradient-to-br from-secondary/50 to-warning/10 border-warning/20">
            <div className="flex items-center gap-3 mb-3">
              <Gauge className="w-5 h-5 text-warning" />
              <h3 className="font-semibold text-foreground">Speed</h3>
            </div>
            <div className="text-2xl font-bold text-warning">
              {speed.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">km/h</span>
            </div>
          </Card>

          {/* Elapsed Time */}
          <Card className="p-4 bg-gradient-to-br from-secondary/50 to-success/10 border-success/20">
            <div className="flex items-center gap-3 mb-3">
              <Clock className="w-5 h-5 text-success" />
              <h3 className="font-semibold text-foreground">Elapsed Time</h3>
            </div>
            <div className="text-2xl font-bold text-success">
              {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
              <span className="text-sm font-normal text-muted-foreground ml-2">min:sec</span>
            </div>
          </Card>

          {/* Progress */}
          <Card className="p-4 bg-gradient-to-br from-secondary/50 to-primary/10 border-primary/20">
            <h3 className="font-semibold text-foreground mb-3">Route Progress</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress:</span>
                <span className="text-foreground font-mono">
                  {currentIndex + 1} / {routeData.length}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-primary to-accent h-2 rounded-full transition-all duration-500"
                  style={{ width: `${routeData.length ? ((currentIndex + 1) / routeData.length) * 100 : 0}%` }}
                />
              </div>
              <div className="text-center text-xs text-muted-foreground">
                {routeData.length ? (((currentIndex + 1) / routeData.length) * 100).toFixed(1) : 0}% Complete
              </div>
            </div>
          </Card>

          {/* Map Info */}
          <Card className="p-4 bg-gradient-to-br from-secondary/50 to-info/10 border-info/20">
            <h3 className="font-semibold text-foreground mb-3">Map Information</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Map Provider:</span>
                <span className="text-foreground">OpenStreetMap</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">No Token Required:</span>
                <span className="text-success">✓ Free & Open</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VehicleMap;