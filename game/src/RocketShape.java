import java.awt.*;
import java.awt.geom.AffineTransform;
import javax.swing.*;


public class RocketShape
{
    // variables
    private int x, y;

    private int angleOfRocket = 0;

    private double rocketFactor = 0.2;

    private Polygon rocketPolygon;


    public int getAngleOfRocket()
    {
        return angleOfRocket;
    }


    public int getXToRotateAbout()
    {
        return (int)( rocketFactor * ( xRocket[5] + xRocket[4] ) / 2 + x );
    }


    public int getYToRotateAbout()
    {
        return (int)( rocketFactor * ( yRocket[0] + yRocket[4] ) / 2 + y );
    }


    // constructors
    public RocketShape( int x, int y )
    {
        this.x = x;
        this.y = y;

        rocketPolygon = new Polygon( xRocket, yRocket, xRocket.length );
    }


    public int getX()
    {
        return x;
    }


    public int getY()
    {
        return y;
    }


    public int getHeightOfRocket()
    {
        return (int)( rocketFactor * ( yRocket[0] + yRocket[4] ) );

    }


    public double getRocketFactor()
    {
        return rocketFactor;
    }


    public int getWidthOfRocket()
    {
        return (int)( rocketFactor * ( xRocket[5] + xRocket[4] ) );
    }


    public int[] getXCoords()
    {
        return xRocket;
    }


    public int[] getYCoords()
    {
        return yRocket;
    }

    private int[] xRocket = { 30, 50, 50, 60, 60, 0, 0, 10, 10 }; // -70

    private int[] yRocket = { 0, 25, 100, 110, 135, 135, 110, 100, 25 }; // -315

    private int[] xFlameOrig = { 0, 0, 5, 10, 20, 30, 40, 45, 50, 60, 60 }; // -70

    private int[] xFlame = new int[xFlameOrig.length];

    private int[] yFlame = { 140, 155, 150, 175, 155, 160, 145, 170, 145, 160, 140 }; // -455


    public int drawFilled( Graphics gr, boolean thrusters, boolean rightArrow, boolean leftArrow )
    {

        if ( rightArrow && angleOfRocket != -90 )
        {
            angleOfRocket -= 10;

        }
        else if ( leftArrow && angleOfRocket != 90 )
        {
            angleOfRocket += 10;
        }

        Graphics2D g2d = (Graphics2D)gr;
        AffineTransform old = g2d.getTransform();

        g2d.rotate( Math.toRadians( angleOfRocket ),
            rocketFactor * ( xRocket[5] + xRocket[4] ) / 2 + x,
            rocketFactor * ( yRocket[0] + yRocket[4] ) / 2 + y );

        // Zoomer.rotateAboutRocket( (Rocket)this );
        // gr.drawRect( x, y, 100, 100 )

        // ORIGINAL ROCKET
        gr.setColor( Color.WHITE );
        // gr.drawPolygon( shiftArrayByConstant( xRocket, x ),
        // shiftArrayByConstant( yRocket, y ), xRocket.length );

        // rocketPolygon = new Polygon(shiftArrayByConstant(xRocket, x),
        // shiftArrayByConstant(yRocket, y), shiftArrayByConstant(xRocket,
        // x).length);
        // rocketPolygon.translate( x, y);

        gr.drawPolygon( shiftArrayByConstant( xRocket, x ), shiftArrayByConstant( yRocket, y ), xRocket.length );

        // EXPERIMENTAL (DELETE BELOW)
        // boolean explode = true ;
        // int num = 5 * xRocket.length ;
        //
        // if (explode)
        // {
        // for (int i = 0; i < xRocket.length-1; i++)
        // {
        // gr.drawLine( xRocket[i], yRocket[i], xRocket[i+1], yRocket[i+1] );
        // }
        // }
        // END EXPERIMENTAL (DELETE ABOVE)

        // for (int i = 0; i < xRocket.length-1; i++)
        // {
        // gr.drawLine( shift(xRocket[i], x), shift(yRocket[i], y),
        // shift(xRocket[i+1], x), shift(yRocket[i+1], y) );
        // }
        // gr.drawLine( shift(xRocket[0], x), shift(yRocket[0], y),
        // shift(xRocket[xRocket.length-1], x), shift(yRocket[yRocket.length-1],
        // y) );
        // gr.setColor( Color.WHITE );

        // gr.drawOval(shiftCoords(0, x), shiftCoords(0, x), 15, 15) ;

        // gr.drawPolygon( shiftArrayByConstant(xWindow, x),
        // shiftArrayByConstant(yWindow, y), xWindow.length );\
        // gr.drawOval( )

        // gr.setColor( Color.WHITE );
        // gr.drawPolygon()
        //
        // g2d.scale(1, 1);

        if ( thrusters )
        {
            xFlame[0] = xFlameOrig[0];
            xFlame[xFlame.length - 1] = xFlameOrig[xFlameOrig.length - 1];
            for ( int i = 1; i < xFlame.length - 1; i++ )
                xFlame[i] = xFlameOrig[i] + ( (int)( Math.random() * 6.0 ) ) - 3;

            gr.setColor( Color.WHITE );
            gr.drawPolyline( shiftArrayByConstant( xFlame, x ), shiftArrayByConstant( yFlame, y ), xFlame.length );
        }

        g2d.setTransform( old );

        return angleOfRocket;
    }


    public void setRocketPolygon( int x, int y )
    {
        rocketPolygon = new Polygon( shiftArrayByConstant( xRocket, x ),
            shiftArrayByConstant( yRocket, y ),
            shiftArrayByConstant( xRocket, x ).length );
    }


    public int[] shiftArrayByConstant( int[] arr, int constant )
    {
        int[] array = new int[arr.length];

        for ( int i = 0; i < arr.length; i++ )
        {
            array[i] = (int)( rocketFactor * arr[i] + constant );
        }

        return array;
    }


    public int shift( int coord, int constant )
    {
        return (int)( rocketFactor * coord + constant );
    }


    public int shiftCoords( int c, int constant )
    {
        return c + constant;
    }


    public int move( int coord, int constant )
    {
        return coord + constant;
    }


    // change the center of the circle to a new X and Y
    public void setPosition( int newX, int newY )
    {
        x = newX;
        y = newY;
    }


    public Polygon getRocketPolygon()
    {
        return rocketPolygon;
    }


    public void resetPos()
    {
        x = 100;
        y = 100;
        angleOfRocket = 0;
    }
}
