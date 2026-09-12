package online.gpsgps.bscsampling;

import org.junit.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public final class MarkerLayoutTest {
    @Test
    public void threeSamplesAtOneSiteAreDisplayedAtThreePositions() {
        double latitude = 29.669001;
        double longitude = 94.339717;
        Set<String> positions = new HashSet<>();

        for (int index = 0; index < 3; index++) {
            MarkerLayout.Position position = MarkerLayout.spread(latitude, longitude, index, 3);
            positions.add(String.format(java.util.Locale.ROOT, "%.8f,%.8f",
                    position.latitude, position.longitude));
        }

        assertEquals(3, positions.size());
    }

    @Test
    public void oneSampleStaysAtItsRealCoordinate() {
        MarkerLayout.Position position = MarkerLayout.spread(29.669001, 94.339717, 0, 1);

        assertEquals(29.669001, position.latitude, 0.0);
        assertEquals(94.339717, position.longitude, 0.0);
    }

    @Test
    public void decimalSiteCodeShrinksToFitInsideDrop() {
        float fitted = MarkerLayout.fitTextSize(40f, 24f, 84f, 110f);

        assertTrue(fitted < 40f);
        assertTrue(110f * fitted / 40f <= 84.01f);
    }
}
