import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics;
import java.awt.GraphicsEnvironment;


/**
 * Represents the information that the player sees displayed on the screen.
 *
 * @author Tejasvi Kothapalli
 * @version May 23, 2016
 * @author Period: 3
 * @author APCS Final Project: LunarX
 *
 * @author Sources: None
 */
public class PlayerDisplay
{
    // public int fuel = 50;
    /**
     * The rocket the information refers to
     */
    Rocket rocket;

    /**
     * The game in which the information is displayed
     */
    LunarX lunar;

    /**
     * The number of the player has
     */
    static int points;
    // int time = 0 ;


    /**
     * Constructs the PlayerDisplay object. Assigns the rocket and the LunarX
     * game to the fields, and sets the initial poitn value to 0.
     * 
     * @param r
     *            the rocket the information refers to
     * @param l
     *            the game in which the information is displayed
     */
    public PlayerDisplay( Rocket r, LunarX l )
    {
        points = 0;
        rocket = r;
        lunar = l;
    }


    /**
     * Displays the information about the rocket and the player's points. In
     * addition, the showInfo also sets the font and determines whether or not
     * to decrement the fuel count based on if the player is holding down the
     * key for thrust.
     * 
     * @param g
     *            the Graphics object
     * @param started
     *            the boolean to detect whether the game is in progress or not
     */
    public void showInfo( Graphics g, boolean started )
    {
        g.setColor( Color.WHITE );
        // String fonts[] =
        // GraphicsEnvironment.getLocalGraphicsEnvironment().getAvailableFontFamilyNames();
        // for ( int i = 0; i < fonts.length; i++ )
        // {
        // System.out.println( fonts[i] );
        // }
        Font f = new Font( "Agency FB", Font.PLAIN, 30 );

        g.setFont( f );

        // if (!started)
        g.drawString( "POINTS: " + points, 10, 30 );

        // g.drawString( "TIME: " + ( lunar.getElapsedTime() / 60000 ) + " : " +
        // ( lunar.getElapsedTime() / 1000 ) % 60, 10, 60 );

        if ( lunar.getUpArrow() && rocket.getFuel() != 0 && started )
        {
            // fuel--;
            rocket.decrementFuel();
        }

        // g.drawString( "FUEL: " + fuel, 10, 90 );
        g.drawString( "FUEL: " + rocket.getFuel(), 10, 90 );

        // right side info

        g.drawString( "ALTITUDE: " + ( lunar.getHeight() - rocket.getY() ), lunar.getWidth() - 300, 30 );

        g.drawString( "HORIZANTAL VELOCITY: " + (int)( rocket.getVelocityX() * 20 ), lunar.getWidth() - 300, 60 );

        g.drawString( "VERTICAL VELOCITY: " + (int)( rocket.getVelocityY() * 20 ), lunar.getWidth() - 300, 90 );
    }


    /**
     * Increments the player's points by the given value.
     * 
     * @param x
     *            the value to increment the points by
     */
    public static void incrementPoints( int x )
    {
        points += x;
    }

    // public int getFuel()
    // {
    // return fuel ;
    //
    // }
}
// public void time()
// {
// long startTime = System.nanoTime();
// float currentTime = 0 ;
// while (currentTime < 10)
// {
// currentTime = (system.n)
// }
// }

// long globalStartTime = System.nanoTime();
// float currentTime = 0;
// while ( currentTime < 10){
// currentTime = (System.nanoTime() - globalStartTime) / 1000000000f;
// System.out.println(currentTime);
// }
// public void start(Graphics g, boolean spaceBar)
// {
// g.setColor( Color.WHITE );
// g.drawString( "CLICK TO PLAY/nARROW KEYS TO MOVE", lunar.getWidth()/2,
// lunar.getHeight()/2 );
// }
// }
