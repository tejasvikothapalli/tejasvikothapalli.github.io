import java.lang.reflect.Field;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Queue;
import java.util.Set;
import java.util.regex.*;

import org.junit.*;

import static org.junit.Assert.*;
import junit.framework.JUnit4TestAdapter;


public class JULunarX
{
    // Test for Rocket
    Rocket r;

    int initialX = 100;

    int initialY = 100;

    int widthOfWindow = 400;

    int heightOfWindow = 200;


    @Test
    public void rocketConstructor()
    {
        r = new Rocket( initialX, initialY );

        assertEquals( "<< Rocket: x should be " + r.getX() + " >>", initialX, r.getX() );
        assertEquals( "<< Rocket: y should be " + r.getY() + " >>", initialY, r.getY() );
    }


    @Test
    public void rocketDoFrame()
    {
        r = new Rocket( initialX, initialY );

        r.doFrame( null, widthOfWindow, heightOfWindow, false, false, false, null, false, false );

        assertEquals( "<< Rocket: x should be " + r.getX() + " >>", initialX, r.getX() );

    }


    @Test
    public void rocketFindPositionX()
    {
        r = new Rocket( initialX, initialY );

        double previousVelocityX = r.getVelocityX();

        r.doFrame( null, widthOfWindow, heightOfWindow, false, false, false, null, false, false );

        assertEquals(
            "<< Rocket: x should be " + initialX + previousVelocityX + 1.0 / 2.0 * r.findAccelerationX( false ) + " >>",
            initialX + previousVelocityX + 1.0 / 2.0 * r.findAccelerationX( false ),
            r.findPositionX( false ),
            0.1 );
    }


    @Test
    public void rocketFindPositionY()
    {
        r = new Rocket( initialX, initialY );

        double previousVelocityY = r.getVelocityY();

        r.doFrame( null, widthOfWindow, heightOfWindow, false, false, false, null, false, false );

        assertEquals(
            "<< Rocket: y should be " + ( initialY + previousVelocityY + 1.0 / 2.0 * r.findAccelerationY( false ) )
                + " >>",
            initialX + previousVelocityY + 1.0 / 2.0 * r.findAccelerationY( false ),
            r.findPositionY( false ),
            0.1 );
    }


    @Test
    public void rocketFindVelocityX()
    {
        r = new Rocket( initialX, initialY );

        r.doFrame( null, widthOfWindow, heightOfWindow, false, false, false, null, false, false );


        assertEquals( "<< Rocket: velcotiyX should be " + ( 2 + r.findAccelerationX( false ) ) + " >>",
            ( 2 + r.findAccelerationX( false ) ),
            r.findVelocityX( false ),
            0.01 );

    }
    
     @Test
     public void rocketRocketFindVelocityY()
     {
         r = new Rocket( initialX, initialY );

         r.doFrame( null, widthOfWindow, heightOfWindow, false, false, false, null, false, false );


         assertEquals( "<< Rocket: velcotiyX should be " + ( 1 + r.findAccelerationY( false ) ) + " >>",
             ( 1 + r.findAccelerationY( false ) ),
             r.findVelocityY( false ),
             0.01 );
     }
    
     @Test
     public void rocketFindAccelerationX()
     {
//         assertEquals( "<< Rocket: velcotiyX should be " + ( 1 + r.findAccelerationY( false ) ) + " >>",
//             ( 1 + r.findAccelerationY( false ) ),
//             r.findVelocityY( false ),
//             0.01 );
     }

    //
    // @Test
    // public void rocketFindAccelerationY()
    // {
    //
    // }
    //
    // @Test
    // public void rocketGetPoints()
    // {
    //
    // }
    //
    // @Test
    // public void rocketExplode()
    // {
    //
    // }
    //
    // @Test
    // public void rocketCheckForLanding()
    // {
    //
    // }
    //
    // @Test
    // public void rocketStopRocket()
    // {
    //
    // }
    //
    // @Test
    // public void rocketReset()
    // {
    //
    // }
    //
     

     Stars s;
     
     Landscape l;
       
     @Test
     public void starsConstructor()
     {
         l = new Landscape( 400, 400, 200, 3, 1, 5, 1 );
         s = new Stars(24, l) ;
    
         assertTrue( "<< Stars: coords should have 24 stars >>",
         s.toStr().contains( "24" ) );
     }
    
     @Test
     public void starsDrawStars()
     {
         l = new Landscape( 300, 300, 200, 3, 1, 5, 1 );
         s = new Stars(45, l) ;
    
         assertTrue( "<< Stars: coords should have 24 stars >>",
         s.toStr().contains( "45" ) );
     }

     @Test
     public void starsToString()
     {
         l = new Landscape( 300, 300, 200, 3, 1, 5, 1 );
         s = new Stars(45, l) ;
         
         assertNotNull("<< Stars: toStr should not be null", s.toStr()) ;
     }
     
     @Test
     public void landscapeConstructor()
     {
         l = new Landscape(500, 500, 300, 3, 1, 5, 1) ;
         
         assertTrue("<< Landscape: Invalid landscape Constructor >>", l.getWidth() == 500 && l.getMaxHeight() == 500 && l.getMinHeight() == 300 && l.getZoneWidth() == 100) ;
     }

     @Test
     public void landscapeDrawLandscape()
     {
         l = new Landscape(1000, 700, 400, 3, 1, 5, 1) ;
         
         assertTrue("<< Landscape: drawLandscape does not work correctly >>", l.getMaxHeight() == 700 && l.getMinHeight() == 400) ;
     }
     
     //TEST THIS SENPAI
     @Test
     public void landscapeDrawZoomedLandscape()
     {

     }
     
     //TEST THIS SENPAI
     @Test
     public void landscapePutPointValues()
     {
         
     }
     
     @Test
     public void landscapeGetCoordinates()
     {
         l = new Landscape(1000, 700, 400, 3, 1, 5, 1) ;
         
         assertTrue("<< Landscape: getCoordinates does not work correctly >>", l.getCoordinates().length == 1000 ) ;
     }
     
     @Test
     public void landscapeGetWidth()
     {
         l = new Landscape(1000, 700, 400, 3, 1, 5, 1) ;
         
         assertTrue("<< Landscape: getWidth does not return correct width >>", l.getWidth() == 1000) ;
     }
     
     @Test
     public void landscapeGetMinHeight()
     {
         l = new Landscape(1000, 700, 400, 3, 1, 5, 1) ;
         
         assertTrue("<< Landscape: getMinHeight does not return correct minimum height >>", l.getMinHeight() == 400) ;
     }
     
     @Test
     public void landscapeGetMaxHeight()
     {
         l = new Landscape(1000, 700, 400, 3, 1, 5, 1) ;
         
         assertTrue("<< Landscape: getMaxHeight does not return correct maximum height >>", l.getMaxHeight() == 700) ;
     }
     
     //TEST THIS SENPAI
     @Test
     public void landscapeGetLandscapePolygon()
     {
         
     }
     
     @Test
     public void landscapeGetLandingPoints()
     {
         l = new Landscape(500, 500, 300, 3, 1, 5, 1) ;
         
         assertEquals("<< Landscape: getLandingPoints does not return landing points correclty >>", l.getLandingPoints().size() != 5);
         
     }
    // Remove block comment below to run JUnit test in console

    /**
     * Returns a new adapter for the class
     * 
     * @return new adapter
     */
    public static junit.framework.Test suite()
    {
        return new JUnit4TestAdapter( JULunarX.class );
    }


    /**
     * This main method runs first.
     * 
     * @param args
     *            represents string array.
     */
    public static void main( String args[] )
    {
        org.junit.runner.JUnitCore.main( "JULunarX" );
    }

}
