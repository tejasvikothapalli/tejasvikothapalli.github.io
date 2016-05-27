import java.awt.*;
import java.awt.event.KeyEvent;
import java.awt.event.KeyListener;
import java.awt.geom.AffineTransform;
import java.awt.geom.Area;
import java.util.*;


/**
 * An object belonging to the BouncingBall class is a colored circle that is
 * meant to be used with SimpleAnimationApplet.java. The ball is created with a
 * specified color, position, and radius. At the time it is created, a random
 * velocity is chosen for it. The doFrame() method draws the ball and changes
 * its position by adding the velocity to the current position. A setPosition()
 * method is provided for changing the position. The headTowards() method
 * changes the velocity so that the ball is moving in the direction of a
 * specified point.
 * 
 * @author G. Peck
 * @author Sources - David J. Eck
 * @version January 31, 2002
 */
public class Rocket extends RocketShape
// implements KeyListener
{
    // The ball's velocity, given in terms of the amount by which
    // centerX and centerY change in each frame
    private double velocityX;

    private double velocityY;

    private double airResistance;

    private double gravity;

    private double upArrow;

    private int angleOfRocket;

    private int points;

    private LinkedList<RocketPiece> rocketPieces;

    private boolean crash = false;

    private int crashX;

    private int crashY;

    private int crashNum = 0;

    public int fuel = 100;

    double rocketScaleFactor = 0.2;


    /**
     * Constructor for the BouncingBall object.Construct a new bouncing ball
     * object with the specified color, position, and radius. The x and y
     * components of the velocity re random numbers between -10 and 10, except
     * that at least one of the components must be greater than 3 in absolute
     * value.
     * 
     * @param color
     *            fill color of the ball
     * @param centerX
     *            x-coordinate of the center of the circle
     * @param centerY
     *            y-coordinate of the center of the circle
     * @param radius
     *            radius of the circle
     */
    public Rocket( int centerX, int centerY )
    {
        super( centerX, centerY );

        velocityX = 2;
        velocityY = 1;

        gravity = 0.09;
        airResistance = 0.001;

        upArrow = 0.3;

        points = 0;

        int[] coordsX = getXCoords();

        int[] coordsY = getYCoords();

        rocketPieces = new LinkedList<RocketPiece>();
        for ( int i = 0; i < coordsX.length - 1; i++ )
        {

            rocketPieces.add( new RocketPiece( (int)( rocketScaleFactor * coordsX[i] ),
                (int)( rocketScaleFactor * coordsY[i] ),
                (int)( rocketScaleFactor * coordsX[i + 1] ),
                (int)( rocketScaleFactor * coordsY[i + 1] ) ) );
        }
        rocketPieces.add( new RocketPiece( (int)( rocketScaleFactor * coordsX[coordsX.length - 1] ),
            (int)( rocketScaleFactor * coordsY[coordsY.length - 1] ),
            (int)( rocketScaleFactor * coordsX[0] ),
            (int)( rocketScaleFactor * coordsY[0] ) ) );
    }


    /**
     * Draw the ball in the given graphics context, g. Then adjust the position
     * Furthermore, if the ball moves is outside the rectangle 0 &lt; x &lt;
     * width, 0 &lt; y &lt; height, adjust the sign of the x or y component of
     * the velocity to make the ball head back into the rectangle. This method
     * is meant to be called once for each frame of the animation.
     * 
     * @param g
     *            graphics context
     * @param width
     *            width of the drawing area
     * @param height
     *            height of the drawing area
     */
    public boolean doFrame(
        Graphics g,
        int width,
        int height,
        boolean thruster,
        boolean rightArrow,
        boolean leftArrow,
        LunarX l,
        boolean landed,
        boolean started )
    {

        if ( fuel == 0 )
        {
            thruster = false;
        }

        if ( !started )
        {
            return false;
        }
        angleOfRocket = drawFilled( g, thruster, rightArrow, leftArrow );
        if ( !landed )
        {
            int newX = (int)( findPositionX( thruster ) );
            int newY = (int)( findPositionY( thruster ) );

            setPosition( newX, newY );

            setRocketPolygon( newX, newY );

            velocityY = findVelocityY( thruster );

            velocityX = findVelocityX( thruster );
        }

        return true;

    }

    public double findPositionX( boolean thruster )
    {
        return getX() + velocityX + 1.0 / 2.0 * findAccelerationX( thruster );
    }


    public double findPositionY( boolean thruster )
    {
        // int previous = getY();
        // int next = (int)(getY() + velocityY + 1.0 / 2.0 * findAccelerationY(
        // thruster ));
        // if (previous == next)
        // {
        // if (velocityY > 0)
        // {
        // return next + 1;
        // }
        // else
        // {
        // return next -1;
        // }
        // }

        return getY() + velocityY + 1.0 / 2.0 * findAccelerationY( thruster );
    }


    public double findVelocityX( boolean thruster )
    {
        return velocityX + findAccelerationX( thruster );
    }


    public double findVelocityY( boolean thruster )
    {
        return velocityY + findAccelerationY( thruster );
    }


    public double findAccelerationX( boolean thruster )
    {
        if ( thruster )
        {
            if ( velocityX < 0 )
            {
                return upArrow * Math.sin( Math.toRadians( angleOfRocket ) ) + airResistance;
            }
            else
            {
                return upArrow * Math.sin( Math.toRadians( angleOfRocket ) ) - airResistance;
            }
        }

        if ( velocityX > 0 )
        {
            return -airResistance;
        }
        else
        {
            return airResistance;
        }

    }


    public double findAccelerationY( boolean thruster )
    {
        if ( thruster )
        {
            return gravity - upArrow * Math.cos( Math.toRadians( angleOfRocket ) );
        }

        return gravity;
    }


    public int getPoints()
    {
        return points;
    }


    public void explode( Graphics g, LunarX lunar )
    {
        // int[] line1 = {x+getXCoords()[0], y+getYCoords()[0]} ;
        // int[] line2 = {x+getXCoords()[1], y+getYCoords()[1]} ;
        // int[] line3 = {x+getXCoords()[2], y+getYCoords()[2]} ;
        // int[] line4 = {x+getXCoords()[3], y+getYCoords()[3]} ;
        // int[] line5 = {x+getXCoords()[5], y+getYCoords()[5]} ;
        // int[] line6 = {x+getXCoords()[6], y+getYCoords()[6]} ;
        // int[] line7 = {x+getXCoords()[7], y+getYCoords()[7]} ;
        // int[] line8 = {x+getXCoords()[8], y+getYCoords()[8]} ;
        // int[] line9 = {x+getXCoords()[9], y+getYCoords()[9]} ;
        //
        // g.drawLine(line1[0], line1[1], line1[0]+1, line1[1]+10) ;
        // line1[0]++;
        // line1[1] += 10 ;
        // g.drawLine(line2[0], line2[1], line2[0]+1, line1[1]+9);
        // line2[0]++ ;
        // line2[1] += 9 ;
        // g.drawLine( line3[0], arg1, arg2, arg3 );

        // int[] coordsX = getCurrentX();
        // int[] coordsY = getCurrentY();
        // int num = 5 * coordsX.length ;
        // for (int i = 0; i < coordsX.length-1; i++)
        // {
        // // g.drawLine( coordsX[i], coordsY[i], coordsX[i+1], coordsY[i+1] );
        // }
        // System.out.println("Coords: (" + getX() + ", " + getY()) ;
        if ( crash == true )
        {
            for ( RocketPiece p : rocketPieces )
            {
                p.setCrashCoords( crashX, crashY );
            }
            crashX = 0;
            crashY = 0;
        }
        crash = false;
        crashNum = 1;
        g.setColor( Color.WHITE );
        // for ( int i = 0; i < coordsX.length - 1; i++ )
        // {
        //// g.drawLine( (int)( coordsX[i] * 0.3 ),
        //// (int)( coordsY[i] * 0.3 ),
        //// (int)( coordsX[i + 1] * 0.3 ),
        //// (int)( coordsY[i + 1] ) );
        // g.drawLine( , arg1, arg2, arg3 );
        // }
        // g.drawOval(move(x, 5), move(y, 5), 10, 10) ;
        // g.setColor( Color.WHITE );
        // x+= 5 ;
        // y+=5 ;
        // if (fuel == 0)
        // {
        // Font f = new Font("Agency FB", Font.PLAIN, 30) ;
        //
        // int width = lunar.getWidth() ;
        // int height = lunar.getHeight() ;
        // FontMetrics metrics = g.getFontMetrics(f);
        // int x = (width - metrics.stringWidth("GAMEOVER")) / 2;
        // int y = (height - metrics.getHeight()) / 2 + metrics.getAscent();
        // g.setFont(f);
        // // Draw the String
        // g.drawString("GAMEOVER", x, y-200);
        // }
        for ( RocketPiece p : rocketPieces )
        {
            p.draw( g );
        }
    }


    public int checkForLanding( Landscape land, Graphics g, LunarX l )
    {
        // 0 to keep animating
        // 1 to show rocket has won
        // 2 rocket should explode
        g.setColor( Color.white );
        //
        // g.drawRect( getX(), getY(), getWidthOfRocket(), getHeightOfRocket()
        // );

        Area area = new Area( getRocketPolygon() );
        area.intersect( new Area( land.getLandscapePolygon() ) );

        if ( !area.isEmpty() )
        {
            // explode(g);
            // l.stop();
            // int x = getX() ;
            // int y = getY() ;
            // for (RocketPiece p : rocketPieces)
            // {
            // p.setCrashCoords(x, y) ;
            // }

            if ( angleOfRocket == 0 && getX() >= land.getLandingPoints().get( getX() / land.getZoneWidth() ).getStartX()
                && getX() + getWidthOfRocket() <= land.getLandingPoints().get( getX() / land.getZoneWidth() ).getEndX()
                && getVelocityY() * 20 < 60 )
            {
                // PlayerDisplay.incrementPoints( land.getLandingPoints().get(
                // getX()/land.getZoneWidth()).getPoints() );
                return 1;
            }
            else if ( crashNum == 0 )
            {
                crash = true;
                // stopRocket(g) ;
                crashX = getX();
                crashY = getY();
            }
            // for (RocketPiece p : rocketPieces)
            // {
            // p.setCrashCoords(crashX, crashY) ;
            // }

            return 2;
        }
        return 0;
    }


    public void stopRocket( Graphics g )
    {
        velocityX = 0;

        velocityY = 0;
        gravity = 0;
        // g.setColor( Color.BLACK );
    }

    // public void reset( Graphics g )
    // {
    // velocityX = 2;
    // velocityY = 1;
    // angleOfRocket = 0;
    //// x = 100;
    //// y = 100;
    // }

    // public boolean hasCrashed()
    // {
    // return crash;
    // }


    public void decrementFuel()
    {
        if ( !crash )
            fuel--;
    }


    public int getFuel()
    {
        return fuel;
    }


    public double getVelocityX()
    {
        return velocityX;
    }


    public double getVelocityY()
    {
        return velocityY;
    }


    public void stopRocket()
    {
        velocityX = 0;
        velocityY = 0;
        // = false;
    }


    public void reset()
    {
        // System.out.println("reset") ;
        velocityX = 2;
        velocityY = 1;

        setPosition( 100, 100 );

        angleOfRocket = 0;

        crash = false;
        crashNum = 0;
        // setPosition(100, 100);
        // for (RocketPiece p : rocketPieces)
        // {
        // p.resetCrashCoords();
        // }
        int[] coordsX = getXCoords();
        // for (int x = 0; x < coordsX.length; x++)
        // {
        // coordsX[x] = (int)(getRocketFactor()*coordsX[x]) ;
        // }
        int[] coordsY = getYCoords();
        // for (int y = 0; y < coordsX.length; y++)
        // {
        // coordsY[y] = (int)(getRocketFactor()*coordsX[y]) ;
        // }
        LinkedList<RocketPiece> pieces = new LinkedList<RocketPiece>();
        for ( int i = 0; i < coordsX.length - 1; i++ )
        {
            // int velx = (int)(Math.random()*5)+5 ;
            // int vely = (int)(Math.random()*5) ;
            // double neg1 = Math.random() ;
            // double neg2 = Math.random() ;
            // if (neg1 < 0.5)
            // {
            // velx = -velx ;
            // }
            // if (neg2 < 0.5)
            // {
            // vely = -vely ;
            // }
            pieces.add( new RocketPiece( (int)( rocketScaleFactor * coordsX[i] ),
                (int)( rocketScaleFactor * coordsY[i] ),
                (int)( rocketScaleFactor * coordsX[i + 1] ),
                (int)( rocketScaleFactor * coordsY[i + 1] ) ) );// ,
            // (int)(Math.random()*5)-(int)(Math.random()*7),
            // (int)(Math.random()*5)-(int)(Math.random()*7)))
            // ;
            // rocketPieces.add( new RocketPiece )
        }
        pieces.add( new RocketPiece( (int)( rocketScaleFactor * coordsX[coordsX.length - 1] ),
            (int)( rocketScaleFactor * coordsY[coordsY.length - 1] ),
            (int)( rocketScaleFactor * coordsX[0] ),
            (int)( rocketScaleFactor * coordsY[0] ) ) );// ,
        // (int)(Math.random()*5)+5,
        // (int)(Math.random()*5)) )
        // ;
        rocketPieces = pieces;
    }


    public void resetFuel()
    {
        fuel = 1000;
    }
    //
    // public LinkedList<RocketPiece> getRocketPieces()
    // {
    // return rocketPieces ;
    // }
}
