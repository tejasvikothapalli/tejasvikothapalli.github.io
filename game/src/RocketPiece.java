import java.awt.*;

public class RocketPiece
{
    int originalX1 ; 
    int originalY1 ; 
    int originalX2 ;
    int originalY2 ;
    int startX ;
    int startY ;
    int endX ; 
    int endY ;
    int velocityX ;
    int velocityY ;
    
    public RocketPiece(int x1, int y1, int x2, int y2)
    {
        originalX1 = x1 ;
        originalY1 = y1 ;
        originalX2 = x2 ;
        originalY2 = y2 ;
        startX = x1 ;
        startY = y1 ;
        endX = x2 ;
        endY = y2 ;
        velocityX = (int)(Math.random()*5)-(int)(Math.random()*7) ;
        velocityY = (int)(Math.random()*5)-(int)(Math.random()*7) ;
        if ( velocityX == 0 )
        {
            velocityX +=2 ;
        }
        if (velocityY == 0 )
        {
            velocityY += 2 ;
        }
//        velocityX = v1 ;
//        velocityY = v2 ;
    }
    
    public void draw(Graphics g)
    {
        g.setColor(Color.WHITE) ;
        g.drawLine(startX, startY, endX, endY) ;
        startX += velocityX ;
        startY += velocityY ;
        endX += velocityX ;
        endY += velocityY ;
    }
    
    public void setCrashCoords(int x, int y)
    {
        startX += x ;
        startY += y ;
        endX += x ;
        endY += y ;
    }
    
    public void resetCrashCoords()
    {
        startX = originalX1 ;
        startY = originalY1 ;
        endX = originalX2 ;
        endY = originalY2 ;
    }
//    public void move()
//    {
//        startX += velocityX ;
//        startY += velocityY ;
//        endX += velocityX ;
//        endY += velocityY ;
//    }
}
