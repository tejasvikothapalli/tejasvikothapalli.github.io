import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics;
import java.awt.Rectangle;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

import javax.swing.Timer;

public class GameMenu
{
    LunarX lunar;
    
    Font font ; 
    
    public GameMenu(LunarX l, Font f)
    {
        lunar = l ;
        font = f ;
    }
    
    public void showMenu(Graphics g)
    {
        int width = lunar.getWidth() ;
        int height = lunar.getHeight() ;
        FontMetrics metrics = g.getFontMetrics(font);
        int x = (width - metrics.stringWidth("INSERT COINS")) / 2;
        int y = (height - metrics.getHeight()) / 2 + metrics.getAscent();
        // Set the font
        g.setFont(font);
        // Draw the String
        g.drawString("INSERT COINS", x, y-300);
        x = (width - metrics.stringWidth("PRESS SPACE BAR TO PLAY")) / 2 ;
        g.drawString( "PRESS SPACE BAR TO PLAY", x, y-200 );
        x = (width - metrics.stringWidth("ARROW KEYS TO MOVE")) / 2 ;
        g.drawString( "ARROW KEYS TO MOVE", x, y-150 );
    }
    
    public void gameOver(Graphics g)
    {
        int width = lunar.getWidth() ;
        int height = lunar.getHeight() ;
        FontMetrics metrics = g.getFontMetrics(font);
        int x = (width - metrics.stringWidth("GAMEOVER")) / 2;
        int y = (height - metrics.getHeight()) / 2 + metrics.getAscent();
        g.setFont(font);
        // Draw the String
        g.drawString("GAMEOVER", x, y-100);
        x = (width - metrics.stringWidth("OUT OF FUEL")) / 2;
        g.drawString( "OUT OF FUEL", x, y-200 );
//        x = (width - metrics.stringWidth("GENERATING LANDSCAPE..")) / 2 ;
//        g.drawString( "GENERATING LANDSCAPE...", x, y-100 );
    }
}
