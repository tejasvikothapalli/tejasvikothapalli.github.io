import java.applet.Applet;
import java.awt.Graphics;
import java.awt.Font;
import java.awt.Color;

/*
<applet code = "JavaRocksApplet.class" width = 400 height = 200> </applet>
*/
public class LunarX extends Applet
{
    public void paint( Graphics screen )
    {
        Font f = new Font( "TimesRoman", Font.ITALIC, 36 );
        screen.setFont( f );
        Color c = new Color( 40, 80, 120 );
        screen.setColor( c );
        screen.drawString( "Java Rocks!!", 100, 60 );
    }
}
// import javax.swing.*;
// import javax.swing.JTextField;

// import java.awt.*;
// import java.awt.event.*;
// import java.awt.geom.AffineTransform;
// import java.awt.geom.PathIterator;
// import java.util.ArrayList;
// import java.util.Random;
// // import java.util.Timer;
// import java.util.TimerTask;

// // Andrew:
// // Star
// // Start Menu
// // Rocket look better
// // overall color and graphics improve
// // explosion animation


// // nearest neighbor search
// /**
//  * This makes bouncing balls.
//  * 
//  * @author Tejasvi Kothapalli
//  * @version 12/11/14
//  * 
//  * @author Period - 7
//  * @author Assignment - Ch38BEx2_MarchingLines2
//  * 
//  * @author Sources - none
//  */
// public class LunarX extends AnimationBase
// {

//     Rocket rocket;

//     Random rand = new Random();

//     Landscape land;

//     Stars stars;

//     GameMenu menu;

//     public boolean upArrow = false;

//     public boolean rightArrow = false;

//     public boolean leftArrow = false;

//     public boolean spaceBar = false;

//     PlayerDisplay playerInfo;

//     private boolean exploded = false;

//     private boolean started = false;

//     private boolean gameOver = false;
//     // Zoomer zoom;


//     /**
//      * This routine is called by the system when the applet is first created.
//      */
//     public void init()
//     {
//         first = true;

//         getDisplay().addKeyListener( new KeyListener()
//         {

//             @Override
//             public void keyTyped( KeyEvent e )
//             {
//                 // char keyCode = e.getKeyChar();
//                 //// System.out.println(keyCode );
//                 // switch ( keyCode )
//                 // {
//                 // case 'w':
//                 //// System.out.println("up");
//                 // upArrow = true;
//                 // break;
//                 // case 'a':
//                 // // handle down
//                 // leftArrow = true;
//                 // break;
//                 // case 'd':
//                 // // handle left
//                 // rightArrow = true;
//                 // break;
//                 // case KeyEvent.VK_RIGHT:
//                 // // handle right
//                 // break;
//                 // }
//                 // System.out.println(e.getKeyCode() + " " + e.getModifiers());
//                 // if (e.getKeyCode() == KeyEvent.VK_UP)
//                 // {
//                 // System.out.println("Hello");
//                 // }
//             }


//             @Override
//             public void keyReleased( KeyEvent e )
//             {
//                 // char keyCode = e.getKeyChar();
//                 // System.out.println("released: "+keyCode );
//                 // switch ( keyCode )
//                 // {
//                 // case 'w':
//                 //// System.out.println("up");
//                 // upArrow = false;
//                 // break;
//                 // case 'a':
//                 // // handle down
//                 // leftArrow = false;
//                 // break;
//                 // case 'd':
//                 // // handle left
//                 // rightArrow = false;
//                 // break;
//                 // case KeyEvent.VK_RIGHT:
//                 // // handle right
//                 // break;
//                 // }
//                 int c = e.getKeyCode();
//                 if ( c == KeyEvent.VK_UP )
//                 {
//                     upArrow = false;
//                 }
//                 else if ( c == KeyEvent.VK_LEFT )
//                 {
//                     leftArrow = false;
//                 }
//                 else if ( c == KeyEvent.VK_RIGHT )
//                 {
//                     rightArrow = false;
//                 }
//                 else if ( c == KeyEvent.VK_SPACE )
//                 {
//                     spaceBar = false;
//                 }
//             }


//             @Override
//             public void keyPressed( KeyEvent e )
//             {
//                 int c = e.getKeyCode();
//                 if ( c == KeyEvent.VK_UP )
//                 {
//                     upArrow = true;
//                 }
//                 else if ( c == KeyEvent.VK_LEFT )
//                 {
//                     leftArrow = true;
//                 }
//                 else if ( c == KeyEvent.VK_RIGHT )
//                 {
//                     rightArrow = true;
//                 }
//                 else if ( c == KeyEvent.VK_SPACE )
//                 {
//                     spaceBar = true;
//                 }
//             }
//         } );

//         getDisplay().setFocusable( true );
//         getDisplay().requestFocusInWindow();

//         // getDisplay().setSize( 1000, 500 );
//         // setSize( 1250, 700 );

//         Dimension dim = Toolkit.getDefaultToolkit().getScreenSize();
//         getDisplay().setSize( dim.width, dim.height - 80 );
//         setSize( dim.width, dim.height - 80 );

//         land = new Landscape( getWidth(), getHeight() - 5, getHeight() / 2 - 100, 3, 1, 5, 1 );

//         stars = new Stars( 20, land );
//         // getDisplay().setResizable(false);
//         // this.setSize( 1000, 1000 );
//         // getDisplay().setSize( 1000, 1000 );;

//         // int r1 = rand.nextInt( 10 ) + 10;

//         rocket = new Rocket( 100, 100 );
//         playerInfo = new PlayerDisplay( rocket, this );

//         Font f = new Font( "Agency FB", Font.PLAIN, 30 );

//         menu = new GameMenu( this, f );

//         setMillisecondsPerFrame( 50 );

//         // zoom = new Zoomer();
//     }

//     private boolean first = true;


//     /**
//      * This routine is called by the animation framework every time a new frame
//      * needs to be drawn.
//      * 
//      * For this animation, the balls bounce.
//      * 
//      * @throws InterruptedException
//      */
//     public void drawFrame( Graphics g )
//     {
//         super.drawFrame( g );
//         setBackground( Color.black );
//         int width = getWidth();
//         int height = getHeight();
//         playerInfo.showInfo( g, started );

//         if ( rocket.getFuel() == 0 )
//         {
//             menu.gameOver( g );
//         }

//         if ( spaceBar )
//         {
//             started = true;
//         }

//         if ( !started )
//         {
//             menu.showMenu( g );
//         }

//         // menu.gameOver( g );

//         // if (playerInfo.getFuel()==0)
//         // {
//         // rocket.explode( g );
//         // exploded = true ;
//         // }
//         // rocket.explode( g );

//         // if ( !first )
//         // {
//         // boolean stop = rocket.checkForLanding( land, g, this );
//         // if ( stop )
//         // {
//         // rocket.explode( g ) ;
//         // exploded = true ;
//         //// return;
//         // }
//         // }
//         // experimental
//         // if (exploded == false)
//         // {
//         // experimental condition above
//         if ( !first && Zoomer.distanceBetween( rocket.getRocketPolygon(), land.getLandscapePolygon() ) < 100 ) // land.getCoordinates()[rocket.getX()][1]
//         // -
//         // rocket.getY()
//         // <
//         // 100
//         {
//             // Graphics2D g2d = (Graphics2D)g;
//             // AffineTransform old = g2d.getTransform();
//             //
//             // g2d.translate(2 * x / zoneWidth * zoneWidth, 2 * coords[( x /
//             // zoneWidth * zoneWidth )][1] );

//             // g2d.translate( -x1, -y );
//             // AffineTransform at = AffineTransform.getTranslateInstance(x1,y);
//             // g2d.scale(2, 2);

//             // width/5 = zonewidth
//             // g2d.translate( -width / ( width / 5 ) * height / width * (
//             // ((rocket.getX()+ 0.0) - width/5) / ( width / 5 ) * ( width / 5 )
//             // ),
//             // -width / ( width / 5 ) * height / width * ( getHeight() / 2 - 100
//             // ) );

//             // g2d.translate(
//             // -width / ( width / 5 ) * height / width
//             // * ( ( ( rocket.getX() + 0.0 ) - width / 5 ) / ( width / 5 ) * (
//             // width / 5 ) ),
//             // -width / ( width / 5 ) * height / width * ( ( rocket.getY() + 0.0
//             // ) - height / 5 ) );

//             // -width/zoneWidth * (minHeight + maxHeight)/2

//             // g2d.scale( width / ( width / 5 ) * height / width, width / (
//             // width / 5 ) * height / width );

//             Zoomer.zoom( rocket, g, this, land );

//             land.drawZoomedLandScape( g, rocket.getX() );
//             stars.drawStars( g );

//             land.putPointValues( g, getFrameNumber() );
//             int numberForLanding = 0;

//             if ( !first )
//             {
//                 numberForLanding = rocket.checkForLanding( land, g, this );
//                 if ( numberForLanding == 2 )
//                 {

//                     Zoomer.rotateAboutRocket( rocket );
//                     // g.setColor( Color.white );
//                     rocket.explode( g, this );
//                     exploded = true;

//                     // try
//                     // {
//                     // Thread.sleep( 1000 );
//                     // }
//                     // catch ( InterruptedException e )
//                     // {
//                     // // TODO Auto-generated catch block
//                     // e.printStackTrace();
//                     // }
//                     // return;
//                     // TIMER
//                     if ( rocket.getFuel() == 0 )
//                     {
//                         // new java.util.Timer().schedule( new
//                         // java.util.TimerTask()
//                         // {
//                         // @Override
//                         // public void run()
//                         // {
//                         // System.out.println("hello");
//                         // rocket.reset();
//                         // rocket.resetPos();
//                         // Zoomer.revertToNormal();
//                         // started = false;
//                         //// first = true;
//                         // rocket.resetFuel();
//                         // return;
//                         //
//                         // }
//                         // }, 5000 );
//                         Timer timer = new Timer( 3000, new ActionListener()
//                         {
//                             @Override
//                             public void actionPerformed( ActionEvent arg0 )
//                             {

//                                 // Code to be executed
//                                 // System.out.println("hello");
//                                 // started = false;
//                                 // rocket.reset();
//                                 // rocket.resetPos();
//                                 // Zoomer.revertToNormal();
//                                 // // first = true;
//                                 // rocket.resetFuel();
//                                 // return;

//                                 init();
//                                 started = false;

//                             }
//                         } );
//                         timer.setRepeats( false ); // Only execute once
//                         timer.start(); // Go go go!

//                     }
//                     else
//                     {
//                         // new java.util.Timer().schedule( new
//                         // java.util.TimerTask()
//                         // {
//                         // @Override
//                         // public void run()
//                         // {
//                         // System.out.println("hello");
//                         // rocket.reset();
//                         // rocket.resetPos();
//                         // Zoomer.revertToNormal();
//                         // first = true;
//                         // return;
//                         //
//                         // }
//                         // }, 1000 );
//                         Timer timer = new Timer( 3000, new ActionListener()
//                         {
//                             @Override
//                             public void actionPerformed( ActionEvent arg0 )
//                             {
//                                 // Code to be executed
//                                 // System.out.println("hello");

//                                 rocket.reset();
//                                 rocket.resetPos();
//                                 Zoomer.revertToNormal();
//                                 first = true;
//                                 // return;
//                             }
//                         } );
//                         timer.setRepeats( false ); // Only execute once
//                         timer.start(); // Go go go!
//                     }
//                 }
//             }

//             if ( numberForLanding == 0 )
//             {
//                 rocket.doFrame( g, width, height, upArrow, leftArrow, rightArrow, this, false, started );
//             }
//             else if ( numberForLanding == 1 )
//             {
//                 rocket.stopRocket();
//                 // rocket.doFrame( g, width, height, false, false, false, this,
//                 // true, started );

//                 PlayerDisplay
//                     .incrementPoints( land.getLandingPoints().get( getX() / land.getZoneWidth() ).getPoints() );
//                 // started = false;
//                 try
//                 {
//                     Thread.sleep( 1000 );
//                 }
//                 catch ( InterruptedException e )
//                 {
//                     // TODO Auto-generated catch block
//                     e.printStackTrace();
//                 }

//                 // started = true;

//                 rocket.reset();
//                 rocket.resetPos();
//                 Zoomer.revertToNormal();
//                 first = true;
//                 return;

//             }
//         }
//         else
//         {
//             stars.drawStars( g );
//             land.drawLandscape( g, 0, width );

//             rocket.doFrame( g, width, height, upArrow, leftArrow, rightArrow, this, false, started );
//             land.putPointValues( g, getFrameNumber() );
//         }

//         first = false;

//     }


//     public boolean getUpArrow()
//     {
//         return upArrow;
//     }

//     //
//     // public void displayStart( Graphics g )
//     // {
//     // g.setColor( Color.WHITE );
//     // g.drawString( "CLICK TO PLAY/nARROW KEYS TO MOVE", 200, 200 );
//     // }

// }