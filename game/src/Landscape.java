import java.awt.*;
import java.awt.event.*;
import java.awt.geom.AffineTransform;
import java.util.*;
import javax.swing.*;

/**
 * 
 *  Represents the randomly generated landscape of the LunarX game. 
 *
 *  @author  Andrew Kou and Tejasvi Kothapalli
 *  @version May 23, 2016
 *  @author  Period: 3
 *  @author  APCS Final Project: LunarX
 *
 *  @author  Sources: None
 */
public class Landscape
{
    /**
     * The width of the landscape
     */
    int width;

    /**
     * The set maximum height for the terrain
     */
    int maxHeight;

    /**
     * The set minimum height for the terrain
     */
    int minHeight;

    /**
     * The step size for each portion of the terrain
     */
    int stepChange;

    /**
     * The maximum step change for each portion of the terrain
     */
    int stepMax;

    /**
     * The X and Y coordinates of the drawn terrain
     */
    int[][] coords;

    /**
     * The width of the zone where a single landing platform exists
     */
    int zoneWidth;

    /**
     * A map with the Integer of the X-coordinate of where the landing platforms start corresponding the LandPoint objects
     */
    Map<Integer, LandingPoint> landingZones; // hashmap

    /**
     * The change in X for each portion of the terrain
     */
    int changeX;

    /**
     * COMMENT PLS SENPAI
     */
    int starter = 0;

    /**
     * COMMENT THIS SENPAI
     */
    Polygon shape;

    /**
     * COMMENT SENPAI
     */
    int[] xCoords;

    /**
     * COMMENT SENPAI
     */
    int[] yCoords;


    /**
     * Initializes the fields and assigns randomly generated coordinates that are continuous and have flat areas for the landing point. 
     * @param w
     * @param max
     * @param min
     * @param sMax
     * @param change
     * @param numberOfZones
     * @param xC
     */
    public Landscape( int w, int max, int min, int sMax, int change, int numberOfZones, int xC )
    {

        changeX = xC;
        width = w;
        maxHeight = max;
        minHeight = min;
        stepChange = change;
        stepMax = sMax;
        coords = new int[width][2];

        zoneWidth = width / numberOfZones;

        int x = 0;

        landingZones = new HashMap<Integer, LandingPoint>( numberOfZones );
        int numberStarter = 0;

        while ( x < width )
        {
            int startX = (int)( ( Math.random() * zoneWidth / 2 ) + x );
            System.out.print( startX );

            int length = (int)( Math.random() * ( x + zoneWidth - startX ) );

            if ( length < 30 )
            {
                length = (int)( Math.random() * 70 ) + 30;
            }
            if ( length > 80 )
            {
                length = (int)( Math.random() * 50 ) + 30;
                // length = 100;
            }
            System.out.println( " " + ( x + zoneWidth - startX ) + " " + length );

            // landingZones[numberStarter++] = new LandingPoint( startX,
            // minHeight, length );

            landingZones.put( numberStarter++, new LandingPoint( startX, minHeight, length ) );

            x = x + zoneWidth;

        }

        numberStarter = 0;

        double height = Math.random() * maxHeight;
        double slope = ( Math.random() * stepMax ) * 2 - stepMax;

        for ( int i = 0; i < width; i++ )
        {

            height += slope;
            slope += ( Math.random() * stepChange ) * 2 - stepChange;

            if ( slope > stepMax )
            {
                slope = stepMax;
            }

            if ( slope < -stepMax )
            {
                slope = -stepMax;
            }

            if ( height > maxHeight )
            {
                height = maxHeight;
                slope *= -1;
            }

            if ( height < 0 )
            {
                height = 0;
                slope *= -1;
            }

            if ( height < 0 )
            {
                height = 0;
                slope *= -1;
            }

            if ( height < minHeight )
            {
                height = minHeight;
                slope *= -1;
            }

            coords[i][0] = maxHeight;

            coords[i][1] = (int)height;

            if ( numberStarter < landingZones.size() && i == landingZones.get( numberStarter ).getStartX() )
            {

                landingZones.get( numberStarter ).setStartY( coords[i][1] );

                int l = 0;

                while ( i < width && l < landingZones.get( numberStarter ).getLength() )
                {
                    i++;
                    l++;
                    if ( i < width )
                    {
                        coords[i][0] = maxHeight;
                        coords[i][1] = (int)height;
                    }

                }

                numberStarter++;
            }

        }

        int[] xCoordinates = new int[w + 2];
        for ( int i = 0; i < xCoordinates.length - 2; i++ )
        {
            xCoordinates[i] = i;
        }
        xCoordinates[xCoordinates.length - 2] = w - 1;
        xCoordinates[xCoordinates.length - 1] = 0;

        int[] yCoordinates = new int[w + 2];

        for ( int i = 0; i < yCoordinates.length - 2; i++ )
        {
            yCoordinates[i] = coords[i][1];
        }

        yCoordinates[yCoordinates.length - 2] = max + 1;
        yCoordinates[yCoordinates.length - 1] = max + 1;

        shape = new Polygon( xCoordinates, yCoordinates, width + 2 );

        xCoords = xCoordinates;
        yCoords = yCoordinates;

    }

    /**
     * Draws the landscape using the xCoords and yCoords. 
     * @param g the Graphics object
     * @param start the X-coordinate of the starting point of where to draw the terrain
     * @param end the X-coordinate of the ending point of where to draw the terrain
     */
    public void drawLandscape( Graphics g, int start, int end )
    {

//        int numberStarter = starter;
        // g.drawPolygon( shape );
        g.setColor( Color.white );
        g.drawPolyline( xCoords, yCoords, width );

        for ( int i = 0; i < landingZones.size(); i++ )
        {
            g.setColor( Color.blue );
            g.drawLine( landingZones.get( i ).getStartX(),
                landingZones.get( i ).getStartY(),
                landingZones.get( i ).getEndX(),
                landingZones.get( i ).getEndY() );
        }

    }

    /**
     * comment pls senpai
     * TODO Write your method description here.
     * @param g
     * @param x
     */
    public void drawZoomedLandScape( Graphics g, int x )
    {

        starter = x / zoneWidth;

        // g.drawString(starter + "", 200, 200);
        // LandingPoint zone = landingZones[x / zoneWidth];
        // Graphics2D g2d = (Graphics2D)g;
        // AffineTransform old = g2d.getTransform();
        ////
        //// g2d.translate(2 * x / zoneWidth * zoneWidth, 2 * coords[( x /
        // zoneWidth * zoneWidth )][1] );
        //
        //
        //
        // int w = width;
        // int h = 700;
        // int imageWidth = zoneWidth;
        // int imageHeight = maxHeight-minHeight;
        // double x1 = (w - 2 * imageWidth)/2;
        // double y = (h - 2 * imageHeight)/2;
        //// g2d.translate( -x1, -y );
        //// AffineTransform at = AffineTransform.getTranslateInstance(x1,y);
        //// g2d.scale(2, 2);
        // g2d.translate( -width/zoneWidth * 700/width * ( x / zoneWidth *
        // zoneWidth ), -width/zoneWidth * 700/width * (minHeight) );
        //
        // //-width/zoneWidth * (minHeight + maxHeight)/2
        //
        // g2d.scale( width/zoneWidth * 700/width, width/zoneWidth * 700/width);

        // drawLandscape( g, ( x / zoneWidth * zoneWidth ), ( x / zoneWidth *
        // zoneWidth ) + zoneWidth);
        drawLandscape( g, 0, width );

        // g.drawString( "start " + ( x / zoneWidth * zoneWidth ) + "end " + ( (
        // x / zoneWidth * zoneWidth ) ),
        // 200,
        // 200 );

        // g2d.setTransform(old);
        starter = 0;

    }

    /**
     * comment this pls senpai
     * TODO Write your method description here.
     * @param g
     * @param frameNums
     */
    public void putPointValues( Graphics g, int frameNums )
    {
        g.setColor( Color.WHITE );
        for ( int k = 0; k < landingZones.size(); k++ )
        {
            g.setColor( Color.WHITE );
            LandingPoint zone = landingZones.get( k );
            int mid = ( zone.getStartX() + zone.getEndX() ) / 2;
            if ( frameNums % 20 == 0 || frameNums % 20 == 1 || frameNums % 20 == 2 )
            {
                g.drawString( zone.getPoints() + "", mid - 12, zone.getStartY() + 20 );
            }
        }
    }


    // Getters
    /**
     * Gets the coordinates of the landscape terrain. 
     * @return the 2D array containing the coordinates of the terrain
     */
    public int[][] getCoordinates()
    {
        return coords;
    }

    /**
     * Gets the width of the landscape. 
     * @return the width of the landscape. 
     */
    public int getWidth()
    {
        return width;
    }

    /**
     * Gets the minimum height of any point in the terrain of the landscape. 
     * @return the minimum height of the terrain
     */
    public int getMinHeight()
    {
        return minHeight;
    }

    /**
     * Gets the maximum height of any point in the terrain of the landscape. 
     * @return the maximum height of the terrain
     */
    public int getMaxHeight()
    {
        return maxHeight;
    }

    /**
     * Gets the landscape polygon shape. 
     * @return the shape of the landscape
     */
    public Polygon getLandscapePolygon()
    {
        return shape;
    }

    /**
     * Gets the map in which the X-coordinate of the landing platforms corresponds to the LandingPoint object.
     * @return the map containing the LandingPoints
     */
    public Map<Integer, LandingPoint> getLandingPoints()
    {
        return landingZones;
    }

    /**
     * Gets the width of the zone in which a single landing platform exists. 
     * @return the width of the zone
     */
    public int getZoneWidth()
    {
        return zoneWidth;
    }

}
