import static org.junit.Assert.assertEquals;

import java.awt.*;
import java.awt.geom.AffineTransform;
import java.awt.geom.PathIterator;
import java.util.ArrayList;

import org.junit.Test;


public class Zoomer
{
    static AffineTransform old;

    static Graphics2D g2d;


   
    public static void zoom( Rocket rocket, Graphics g, LunarX l, Landscape land )
    {
        int zoneWidth = land.getZoneWidth();
        g2d = (Graphics2D)g;
        int width = l.getWidth();
        int height = l.getHeight();
        old = g2d.getTransform();
        //scale factor * xvalue - point of translation
        if ( 0 - width / ( zoneWidth ) * height / width
            * ( ( ( rocket.getX() + 0.0 ) - width / 5 ) / ( zoneWidth ) * ( zoneWidth ) ) > 0 )
        {
            // System.exit( 0 );
            g2d.translate( 0,
                -width / ( zoneWidth ) * height / width * ( ( rocket.getY() + 0.0 ) - height / 5 ) );
        }
//        else if (width / ( zoneWidth ) * height / width
//                        * ( ( ( rocket.getX() + 0.0 ) - width / 5 ) / ( zoneWidth ) * ( zoneWidth ) ) +  zoneWidth > width)
//        {
//            g2d.translate( -width / ( zoneWidth ) * height / width * ( (  rocket.getX() / ( zoneWidth ) * ( zoneWidth ) )) ,
//                -width / ( zoneWidth ) * height / width * ( ( rocket.getY() + 0.0 ) - height / 5 ) );
//        }
        
//        else if (width / ( zoneWidth ) * height / width
//                        *  rocket.getX()  + (width +  width/5) / (width / ( zoneWidth ) * height / width)    
//                        >  (width / ( zoneWidth ) * height / width) * width) ///This one works
//        {
////            System.exit( 0 );
//            g2d.translate(
//                -width / ( zoneWidth ) * height / width
//                * ( ( ( rocket.getX() ) - width / 5 ) / ( zoneWidth ) * ( zoneWidth ) ) - 3 * zoneWidth,
//                -width / ( zoneWidth ) * height / width * ( ( rocket.getY() + 0.0 ) - height / 5 ) );
//            
//              
//        } 
        else
        {

        g2d.translate(
            -width / ( zoneWidth ) * height / width
                * ( ( ( rocket.getX() + 0.0 ) - width / 5 ) / ( zoneWidth ) * ( zoneWidth ) ),
            -width / ( zoneWidth ) * height / width * ( ( rocket.getY() + 0.0 ) - height / 5 ) );
        }

        g2d.scale( width / ( zoneWidth ) * height / width, width / ( zoneWidth ) * height / width );
    }


    public static void rotateAboutRocket( Rocket rocket )
    {
        g2d.rotate( Math.toRadians( rocket.getAngleOfRocket() ),
            rocket.getXToRotateAbout(),
            rocket.getYToRotateAbout() );
    }


    public static void revertToNormal()
    {
        g2d.setTransform( old );
    }
    
    
    static float dist2( Point v, Point w )
    {
        int xDiff = v.x - w.x;
        int yDiff = v.y - w.y;
        return xDiff * xDiff + yDiff * yDiff;
    }


    static float distToSegmentSquared( Point p, Point v, Point w )
    {
        float l2 = dist2( v, w );
        if ( l2 == 0.0f )
            return dist2( p, v );
        float t = ( ( p.x - v.x ) * ( w.x - v.x ) + ( p.y - v.y ) * ( w.y - v.y ) ) / l2;
        if ( t < 0 )
            return dist2( p, v );
        if ( t > 1 )
            return dist2( p, w );
        Point q = new Point( v.x + Math.round( t * ( w.x - v.x ) ), v.y + Math.round( t * ( w.y - v.y ) ) );
        return dist2( p, q );
    }


    public static float distanceToSegment( Point p, Point v, Point w )
    {
        float squared = distToSegmentSquared( p, v, w );
        return (float)Math.sqrt( squared );
    }


    public static int distanceBetween( Polygon P, Polygon Q )
    {
        float minDist = Float.MAX_VALUE;
        ArrayList<Point> points1 = polygonToPoints( P );
        ArrayList<Point> points2 = polygonToPoints( Q );
        Point last1 = null, last2 = null;
        for ( int i = 0; i < points1.size(); i++ )
        {
            Point p1 = points1.get( i );
            for ( int j = 0; j < points2.size(); j++ )
            {
                Point p2 = points2.get( j );
                int x = Math.abs( p1.x - p2.x );
                int y = Math.abs( p1.y - p2.y );
                // distance between vertices
                float dist = Math.round( Math.hypot( x, y ) );
                if ( dist < minDist )
                    minDist = dist;
                // distance between p1 and a segment of Q
                if ( last2 != null )
                {
                    float fDist2 = distanceToSegment( p1, last2, p2 );
                    if ( fDist2 < minDist )
                        minDist = fDist2;
                }
                // distance between p2 and a segment of P
                if ( last1 != null )
                {
                    float fDist1 = distanceToSegment( p2, last1, p1 );
                    if ( fDist1 < minDist )
                        minDist = fDist1;
                }
                last2 = p2;
            }
            last1 = p1;
        }
        return Math.round( minDist );
    }


    /**
     * Convert a polygon to an array of points
     * 
     * @param pg
     *            the poly
     * @return an arraylist of type Point
     */
    public static ArrayList<Point> polygonToPoints( Polygon pg )
    {
        ArrayList<Point> points = new ArrayList<>();
        PathIterator iter = pg.getPathIterator( null );
        float[] coords = new float[6];
        while ( !iter.isDone() )
        {
            int step = iter.currentSegment( coords );
            switch ( step )
            {
                case PathIterator.SEG_CLOSE:
                case PathIterator.SEG_LINETO:
                case PathIterator.SEG_MOVETO:
                    points.add( new Point( Math.round( coords[0] ), Math.round( coords[1] ) ) );
                    break;
                default:
                    break;
            }
            iter.next();
        }
        return points;
    }
}
