package online.gpsgps.bscsampling;

final class MarkerLayout {
    private static final double METERS_PER_LATITUDE_DEGREE = 111320d;
    private static final double SPREAD_RADIUS_METERS = 28d;

    private MarkerLayout() {}

    static Position spread(double latitude, double longitude, int index, int count) {
        if (count <= 1) return new Position(latitude, longitude);
        double angle = ((double) index / count) * Math.PI * 2d - Math.PI / 2d;
        double latitudeOffset = SPREAD_RADIUS_METERS * Math.sin(angle)
                / METERS_PER_LATITUDE_DEGREE;
        double longitudeScale = Math.cos(Math.toRadians(latitude));
        if (Math.abs(longitudeScale) < 0.000001d) longitudeScale = 0.000001d;
        double longitudeOffset = SPREAD_RADIUS_METERS * Math.cos(angle)
                / (METERS_PER_LATITUDE_DEGREE * longitudeScale);
        return new Position(latitude + latitudeOffset, longitude + longitudeOffset);
    }

    static float fitTextSize(float desiredSize, float minimumSize, float availableWidth,
                             float measuredWidthAtDesiredSize) {
        if (measuredWidthAtDesiredSize <= 0f || measuredWidthAtDesiredSize <= availableWidth) {
            return desiredSize;
        }
        return Math.max(minimumSize, desiredSize * availableWidth / measuredWidthAtDesiredSize);
    }

    static final class Position {
        final double latitude;
        final double longitude;

        Position(double latitude, double longitude) {
            this.latitude = latitude;
            this.longitude = longitude;
        }
    }
}
