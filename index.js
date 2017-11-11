const express = require('express');
const hbs = require('express-handlebars');
const config = require('config');
const request = require('request-promise');
const session = require('cookie-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const winston = require('winston');

const app = express();

const serverconf = config.get('server');
const apiconf = config.get('api');


app.engine('hbs', hbs({extname: 'hbs', defaultLayout: 'main'}));
app.set('view engine', 'hbs');

app.use(express.static('public'));

app.use(session({
    secret: serverconf.get('session-secret'),
    name: serverconf.get('session-name'),
    resave: true,
    saveUninitialized: true,
    cookie: {
      maxAge: 365/2 * 24 * 60 * 60 * 1000 // 1/2 year
    },
  })
);

const logger = new(winston.Logger)({
  transports: [
    new winston.transports.Console({ level: 'info' }),
    new winston.transports.File({
      level: 'info',
      filename: './logs/combined.log',
    }),
  ],
});


const getApiToken = () => {
  return new Promise((fufill, reject) => {
    const options = { method: 'POST',
      url: `${apiconf.get('auth')}`,
      headers: { 'content-type': 'application/json' },
      body: `{
        "client_id": "${apiconf.get('id')}",
        "client_secret": "${authConfig.get('secret')}",
        "audience": "${authConfig.get('audience')}",
        "grant_type": "client_credentials"
      }`
    };

    request(options).then((body) => {
      fufill(body)
    }).catch((err) => {
      reject(1);
    });
    // request(authOptions, (req, res) => {
    //   const body = JSON.parse(res.body);
    //   if (!body.error) {
    //     const apiToken = `${body.token_type} ${body.access_token}`;
    //     logger.log('info', 'API Auth successful!');
    //     fufill(apiToken);
    //   } else {
    //     logger.log('error', 'Could not get API token. Auth failed!');
    //     reject(1);
    //   }
    // });
  });
};

const getUserProfile = (steamid) => {
  return new Promise((fufill, reject) => {
    getApiToken().then((token) => {
      const options = {
        method: 'GET',
        url: `${apiconf.get('address')}:${apiconf.get('port')}/api/user/${steamid}`,
        headers: {
          authorization: `${token}`,
        }
      };
      
      request(options).then((body) => {
        fufill(body);
      }).catch((err) => {
        reject(2);
      });
    }).catch(() => {
      reject(1);
    });
  });
}

const getUserMatches = (steamid) => {
  return new Promise((fufill, reject) => {
    getApiToken().then((token) => {
      const options = {
        method: 'GET',
        url: `${apiconf.get('address')}:${apiconf.get('port')}/api/matches/${steamid}`,
        headers: {
          authorization: `${token}`,
        }
      };
      
      request(options).then((body) => {
        fufill(body);
      }).catch((err) => {
        reject(2);
      });
    }).catch(() => {
      reject(1);
    });
  });
}

const getAllMatches = (steamid) => {
  return new Promise((fufill, reject) => {
    getApiToken().then((token) => {
      const options = {
        method: 'GET',
        url: `${apiconf.get('address')}:${apiconf.get('port')}/matches`,
        headers: {
          authorization: `${token}`,
        }
      };
      
      request(options).then((body) => {
        fufill(body);
      }).catch((err) => {
        reject(2);
      });
    }).catch(() => {
      reject(1);
    });
  });
}

const getTop = () => {
  return new Promise((fufill, reject) => {
    getApiToken().then((token) => {
      const options = {
        method: 'GET',
        url: `${apiconf.get('address')}:${apiconf.get('port')}/api/top10/`,
        headers: {
          authorization: `${token}`,
        }
      };
      
      request(options).then((body) => {
        fufill(body);
      }).catch((err) => {
        reject(2);
      });
    }).catch(() => {
      reject(1);
    });
  });
}

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    next();
  } else {
    res.redirect('/login/');
  }
}


// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Steam profile is serialized
//   and deserialized.
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// Use the SteamStrategy within Passport.
//   Strategies in passport require a `validate` function, which accept
//   credentials (in this case, an OpenID identifier and profile), and invoke a
//   callback with a user object.
passport.use(new SteamStrategy({
    returnURL: 'http://localhost:3000/auth/steam/return',
    realm: 'http://localhost:3000/',
    apiKey: config.get('steam.apikey'),
  },
  (identifier, profile, done) => {
    // asynchronous verification, for effect...
    process.nextTick(() => {

      // To keep the example simple, the user's Steam profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the Steam account with a user record in your database,
      // and return that user instead.
      profile.identifier = identifier;
      return done(null, profile);
    });
  }
));

// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());


//
// MAIN ROUTES
//
app.get('/', (req, res) => {
  res.render('home', {
    page: 'Home',
    user: req.user || undefined,
  })
});

app.get('/login/', (res, req) => {
  res.render('login', {
    page: 'Login',
  });
});

app.get('/user/me', ensureAuthenticated, (req, res) => {
  getUserMatches(req.user.id).then((output) => {
    res.render('user', {
      page: req.user.displayName,
      user: req.user,
      matches: output,
    });
  }).error((err) => {
    res.render('error', {
      code: 500,
      error: err,
    });
  })
});

// GET /logout
//  Ends the session with the user and clears
//  req.user
app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

//
// END MAIN ROUTES
//

// GET /auth/steam
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Steam authentication will involve redirecting
//   the user to steamcommunity.com.  After authenticating, Steam will redirect the
//   user back to this application at /auth/steam/return
app.get('/auth/steam', passport.authenticate('steam', { failureRedirect: '/' }), (req, res) => {
  res.redirect('/');
  }
);

// GET /auth/steam/return
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/steam/return',
  passport.authenticate('steam', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/');
});


app.listen(3000, () => {
  logger.log('info', 'App started.');
});