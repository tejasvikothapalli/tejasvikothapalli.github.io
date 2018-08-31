#!/bin/env python
# See https://github.com/vickysam/ComplexHTTPServer/blob/master/ComplexHTTPServer/__main__.py

try:
    # Python3
    import http.server as SimpleHTTPServer
    import http.server as BaseHTTPServer
    import socketserver as SocketServer
    from SimpleHTTPServer import SimpleHTTPRequestHandler
except ImportError:
    # Python 2
    import SimpleHTTPServer
    import BaseHTTPServer
    import SocketServer
    from SimpleHTTPServer import SimpleHTTPRequestHandler
    import sys
    import os

import base64

key = ""

            
class AuthHandler(SimpleHTTPRequestHandler):
    ''' Main class to present webpages and authentication. '''


    def do_HEAD(self):
        #print "send header"
        #self.send_response(200)
        #self.send_header('Content-type', 'text/html')
        #self.end_headers()
        pass

    def do_AUTHHEAD(self):
        #print "send header"
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm=\"Tejasvi\"')
        self.send_header('Content-type', 'text/html')
        self.end_headers()

    def check_login_password(self,base64_string):
        # if (base64_string == 'Basic '+ base64.b64encode("college:tejasvi")):
        #     print "college MIT Mrs. Mollie A. Woodworth logged"
        #     return True

        # if (base64_string == 'Basic '+ base64.b64encode("tejas:kotha")):
        #     print "CMU interviewer  logged"
        #     return True

        if (base64_string == 'Basic '+ base64.b64encode("tej:kot")):
            print "Harvard interviewer  logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("sanjose:tejasvi")):
            print "Brown interviewer  logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("california:kothapalli")):
            print "Cornell interviewer  logged"
            return True
        
        if (base64_string == 'Basic '+ base64.b64encode("teja:srimannarayana")):
            print "Tejasvi  logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("kothapalli:Green")):
            print "Brown  logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("kothapalli:Rubix")):
            print "Yale  logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("kothapalli:Blue")):
            print "Columbia  logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("kothapalli:Frisbee")):
            print "Stanford  logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("kothapalli:red")):
            print "Cornell  logged"
            return True
        
        if (base64_string == 'Basic '+ base64.b64encode("kothapalli:Energy")):
            print "Duke logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("kothapalli:energy")):
            print "Rice logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("kothapalli:Tensegrity")):
            print "Princeton logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("kothapalli:Computer")):
            print "CMU logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("kothapalli:NASA")):
            print "Harvard logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("Krishna@123:fddsf#4")):
            print "Krishna@123 logged"
            return True
        if (base64_string == 'Basic '+ base64.b64encode("321Abhiram:abdcD$")):
            print "321Abhiram logged"
            return True
        if (base64_string == 'Basic '+ base64.b64encode("gatech.edu:yellowjackets")):
            print "gatech.edu  logged"
            return True
        if (base64_string == 'Basic '+ base64.b64encode("quakers:upenn.edu")):
            print "upenn logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("quakers:upenn")):
            print "upenn1 logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("jerome:fisher")):
            print "Upenn interviewer  logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("UC:TEJASVI")):
            print "uc california logged"
            return True
        
        if (base64_string == 'Basic '+ base64.b64encode("mit:tejasvi.mit")):
            print "MIT logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("caltech:energy")):
            print "Caltech logged"
            return True

        if (base64_string == 'Basic '+ base64.b64encode("energy:tejasvi")):
            print "Upenn or Caltech logged"
            return True
        
        if (base64_string == 'Basic '+ base64.b64encode("uiuc:awesome")):
            print "UIUC logged"
            return True
        # if (base64_string == 'Basic '+ base64.b64encode("kothapalli:tejasvi")):
        #     print "Tejasvi logged"
        #     return True
        # if (base64_string == 'Basic '+ base64.b64encode("kothapalli:tejasvi")):
        #     print "Tejasvi logged"
        #     return True        
        # if (base64_string == 'Basic '+ base64.b64encode("joyce:zhou")):
        #     print "Joyce logged in"
        #     return True

        # if (base64_string == 'Basic '+ base64.b64encode("David:Campos")):
        #     print "David logged in"
        #     return True

        try:
            print "Invalid login:" + base64_string + " " + base64.b64decode(base64_string[6:], altchars=None)
        except TypeError:
            print "Invalid login:" + base64_string + " error decoding"

        sys.stdout.flush()
        return False

    def do_GET(self):
        global key
        ''' Present frontpage with user authentication. '''

        #print "URL:" + self.path + "\n" +"headers:" + str(self.headers)

        if self.path.find("index.html/noauth") != -1:
            self.path="/noauth"
            SimpleHTTPRequestHandler.do_GET(self)
        elif self.path.find("/noauth") != -1:
            SimpleHTTPRequestHandler.do_GET(self)
            #self.send_header("Set-Cookie", "NASA=tejasvi; Expires=Wed, 21 Oct 2022 07:28:00 GMT;")
        elif self.path.find("/NASA") == 0 or self.path.find("/NASA") != -1:
            print "ACCESSED :" + self.path
            self.send_response(301)
            self.send_header('Location', "https://ntrs.nasa.gov/search.jsp?R=20180000394")
            self.end_headers()
            #self.send_header("Set-Cookie", "NASA=tejasvi; Expires=Wed, 21 Oct 2022 07:28:00 GMT;")
            # self.path = "index.html"
            # #import Cookie
            # #import datetime
            # #import random
            # #expiration = datetime.datetime.now() + datetime.timedelta(days=30)
            # #cookie = Cookie.SimpleCookie()
            # #cookie["session"] = "12345678"
            # #cookie["session"] = random.randint(1000000000)
            # #cookie["session"]["domain"] = ".jayconrod.com"
            # #cookie["session"]["path"] = "/"
            # #cookie["session"]["NASA"] = "tejasvi"
            # self.send_header("Set-Cookie", "NASA=tejasvi")
            # #self.send_header("Set-Cookie",  cookie.output())
            # SimpleHTTPRequestHandler.do_GET(self)
        elif self.headers.getheader('Authorization') == None:
            self.do_AUTHHEAD()
            self.wfile.write('Sorry!')
            pass
        #elif self.headers.getheader('Authorization') == 'Basic '+key:
        elif self.check_login_password(self.headers.getheader('Authorization')) :            
            #print key
            #print "hello world "
            sys.stdout.flush()
            # https://www.base64encode.org
            SimpleHTTPRequestHandler.do_GET(self)
            pass
        else:
            self.do_AUTHHEAD()
            #self.wfile.write(self.headers.getheader('Authorization'))
            self.wfile.write('Sorry!!')
            pass



class ThreadingSimpleServer(SocketServer.ThreadingMixIn,BaseHTTPServer.HTTPServer):
        pass

if sys.argv[1:]:
    port = int(sys.argv[1])
else:
    port = 8000

#server = ThreadingSimpleServer(('', port), SimpleHTTPServer.SimpleHTTPRequestHandler)
server = ThreadingSimpleServer(('', port), AuthHandler)
print("Serving HTTP on 0.0.0.0 port",port,"...")

try:
    while 1:
        sys.stdout.flush()
        server.handle_request()
except KeyboardInterrupt:
        print("Finished")

        
# def test(HandlerClass = AuthHandler,
#          ServerClass = BaseHTTPServer.HTTPServer):
#     BaseHTTPServer.test(HandlerClass, ServerClass)


# if __name__ == '__main__':
#     if len(sys.argv)<3:
#         print "usage SimpleAuthServer.py [port] [username:password]"
#         sys.exit()
#     key = base64.b64encode(sys.argv[2])
#     myAuthHandler = AuthHandler
#     myAuthHandler.server_version = "Server: Apache"
#     myAuthHandler.sys_version = ""
#     test(myAuthHandler)
