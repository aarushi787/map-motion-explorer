import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, Pause, RotateCcw, MapPin, Clock, Gauge } from 'lucide-react';
import { toast } from 'sonner';

interface RoutePoint {
  latitude: number;
  longitude: number;
  timestamp: string;
}

const VehicleMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const vehicleMarker = useRef<mapboxgl.Marker | null>(null);
  
  const [mapboxToken, setMapboxToken] = useState('');
  const [isTokenValid, setIsTokenValid] = useState(false);
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

  // Initialize map when token is provided
  useEffect(() => {
    if (!mapboxToken || !mapContainer.current || !routeData.length) return;

    mapboxgl.accessToken = mapboxToken;
    
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [routeData[0].longitude, routeData[0].latitude],
        zoom: 15,
        pitch: 45,
        bearing: 30
      });

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      
      map.current.on('load', () => {
        if (!map.current) return;
        
        // Add route source and layer
        const routeCoordinates = routeData.map(point => [point.longitude, point.latitude]);
        
        map.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: routeCoordinates
            }
          }
        });

        map.current.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#00bfff',
            'line-width': 4,
            'line-opacity': 0.8
          }
        });

        // Add active route layer
        map.current.addSource('active-route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: []
            }
          }
        });

        map.current.addLayer({
          id: 'active-route-line',
          type: 'line',
          source: 'active-route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#00ff00',
            'line-width': 6,
            'line-opacity': 1
          }
        });

        // Create vehicle marker
        const vehicleElement = document.createElement('div');
        vehicleElement.innerHTML = `
          <div class="w-6 h-6 bg-vehicle rounded-full border-2 border-white shadow-lg animate-vehicle-pulse flex items-center justify-center">
            <div class="w-2 h-2 bg-white rounded-full"></div>
          </div>
        `;
        
        vehicleMarker.current = new mapboxgl.Marker({ element: vehicleElement })
          .setLngLat([routeData[0].longitude, routeData[0].latitude])
          .addTo(map.current);

        setIsTokenValid(true);
        toast.success('Map loaded successfully!');
      });

      map.current.on('error', (e) => {
        console.error('Mapbox error:', e);
        setIsTokenValid(false);
        toast.error('Invalid Mapbox token or map loading error');
      });

    } catch (error) {
      console.error('Error initializing map:', error);
      setIsTokenValid(false);
      toast.error('Failed to initialize map');
    }

    return () => {
      map.current?.remove();
    };
  }, [mapboxToken, routeData]);

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
            vehicleMarker.current.setLngLat([currentPoint.longitude, currentPoint.latitude]);
          }

          // Update active route
          if (map.current && map.current.getSource('active-route')) {
            const activeCoordinates = routeData.slice(0, nextIndex + 1).map(point => [point.longitude, point.latitude]);
            (map.current.getSource('active-route') as mapboxgl.GeoJSONSource).setData({
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: activeCoordinates
              }
            });
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
        vehicleMarker.current.setLngLat([routeData[0].longitude, routeData[0].latitude]);
      }

      if (map.current && map.current.getSource('active-route')) {
        (map.current.getSource('active-route') as mapboxgl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        });
      }
    }
    
    toast.info('Vehicle position reset');
  };

  const validateToken = () => {
    if (mapboxToken.trim()) {
      // The map initialization will handle validation
      toast.info('Validating Mapbox token...');
    } else {
      toast.error('Please enter a valid Mapbox token');
    }
  };

  if (!isTokenValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/10 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md p-6 bg-card/90 backdrop-blur-sm border-accent/20 shadow-xl">
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">Vehicle Tracking System</h2>
              <p className="text-muted-foreground">Enter your Mapbox token to get started</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="mapbox-token">Mapbox Public Token</Label>
              <Input
                id="mapbox-token"
                type="text"
                placeholder="pk.ey..."
                value={mapboxToken}
                onChange={(e) => setMapboxToken(e.target.value)}
                className="bg-muted/50"
              />
              <p className="text-xs text-muted-foreground">
                Get your token from{' '}
                <a href="https://mapbox.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  mapbox.com
                </a>
              </p>
            </div>
            
            <Button onClick={validateToken} className="w-full bg-gradient-to-r from-primary to-accent">
              Initialize Map
            </Button>
          </div>
        </Card>
      </div>
    );
  }

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
            >
              {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            <Button onClick={handleReset} variant="secondary">
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
                  style={{ width: `${((currentIndex + 1) / routeData.length) * 100}%` }}
                />
              </div>
              <div className="text-center text-xs text-muted-foreground">
                {(((currentIndex + 1) / routeData.length) * 100).toFixed(1)}% Complete
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VehicleMap;