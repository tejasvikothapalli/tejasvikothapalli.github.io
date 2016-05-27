
public class LandingPoint
{
    private int length;

    private int startX;

    private int startY;

    private int endX;

    private int endY;

    private int points;


    public LandingPoint( int x, int y, int l )
    {
        startX = x;
        startY = y;
        endY = y;
        length = l;
        points = 100;
        endX = startX + l;
    }


    // Getters
    public int getPoints()
    {
        return points;
    }


    public int getLength()
    {
        return length;
    }


    public int getStartX()
    {
        return startX;
    }


    public int getStartY()
    {
        return startY;
    }


    public int getEndX()
    {
        return endX;
    }


    public int getEndY()
    {
        return getStartY();
    }


    // Setters
    public void setStartY( int y )
    {
        startY = y;
    }
}
