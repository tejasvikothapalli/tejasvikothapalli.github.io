// var Yelp = require('yelp');

// <script async defer src="https://maps.googleapis.com/maps/api/js?key=AIzaSyBtapG46SfKsgGbZ-ChRlMFCxI6vgwcJRM&callback=initMap">

 if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(showPosition);
    } else {
        console.log("Geolocation is not supported by this browser.");
    }
console.log ("Hello");

// var yelp = new Yelp({
//   consumer_key: 'consumer-key',
//   consumer_secret: 'consumer-secret',
//   token: 'token',
//   token_secret: 'token-secret',
// });

// var x = document.getElementById("demo");
   


function showPosition(position) {
    console.log("Latitude: " + position.coords.latitude +
    "<br>Longitude: " + position.coords.longitude);
}