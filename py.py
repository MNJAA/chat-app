import turtle

# Set up the screen
screen = turtle.Screen()
screen.bgcolor("white")

# Create a turtle object
pen = turtle.Turtle()
pen.shape("turtle")
pen.color("red")
pen.speed(3)

# Function to draw a heart
def draw_heart():
    pen.begin_fill()
    pen.left(50)
    pen.forward(133)
    pen.circle(50, 200)
    pen.right(140)
    pen.circle(50, 200)
    pen.forward(133)
    pen.end_fill()

# Position the turtle and draw the heart
pen.up()
pen.setpos(0, -100)
pen.down()
draw_heart()

# Hide the turtle and finish
pen.hideturtle()

# Keep the window open
turtle.done()
