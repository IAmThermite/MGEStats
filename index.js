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

const logger = new(winston.Logger)({
  transports: [
    new winston.transports.Console({ level: 'info' }),
    new winston.transports.File({
      level: 'info',
      filename: './logs/combined.log',
    }),
  ],
});

app.engine('hbs', hbs({extname: 'hbs', defaultLayout: 'main', 
  helpers: {
    equal: (lvalue, rvalue, options) => {
      if (arguments.length < 3)
        throw new Error("Helper equal needs 2 parameters");
      if( lvalue!=rvalue ) {
        return options.inverse(this);
      } else {
        return options.fn(this);
      }
    }
  }
}));
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

const getApiToken = () => {
  return new Promise((fufill, reject) => {
    const options = { method: 'POST',
      url: `${apiconf.get('auth')}`,
      headers: { 'content-type': 'application/json' },
      body: `{
        "client_id": "${apiconf.get('id')}",
        "client_secret": "${apiconf.get('secret')}",
        "audience": "${apiconf.get('audience')}",
        "grant_type": "client_credentials"
      }`
    };

    request(options).then((body) => {
      try {
        response = JSON.parse(body);
        fufill(`${response.token_type} ${response.access_token}`);
      } catch(e) {
        reject('-2 Internal JSON parse error');
      }
    }).catch((err) => {
      reject('3 Cannot connect to AUTH0');
    });
  });
};

const getUserProfile = (steamid) => {
  return new Promise((fufill, reject) => {
    getApiToken().then((token) => {
      const options = {
        method: 'GET',
        url: `http://${apiconf.get('address')}:${apiconf.get('port')}/api/user/${steamid}`,
        headers: {
          authorization: `${token}`,
        }
      };
      
      request(options).then((body) => {
        if(body === '-1') {
          reject('-1 Bad query.');
        } else {
          try {
            response = JSON.parse(body);
            fufill(response);
          } catch(e) {
            reject('-2 Internal JSON parse error');
          }
        }
      }).catch((err) => {
        reject('2 Bad API Auth');
      });
    }).catch((err) => {
      reject('1 Cannot connect to API');
    });
  });
}

const getUserMatches = (steamid) => {
  return new Promise((fufill, reject) => {
    getApiToken().then((token) => {
      const options = {
        method: 'GET',
        url: `http://${apiconf.get('address')}:${apiconf.get('port')}/api/matches/${steamid}`,
        headers: {
          authorization: `${token}`,
        }
      };
      
      request(options).then((body) => {
        if(body === '-1') {
          reject('-1 Bad query.');
        } else {
          try {
            response = JSON.parse(body);
            fufill(response);
          } catch(e) {
            reject('-2 Internal JSON parse error');
          }
        }
      }).catch((err) => {
        reject('2 Bad API Auth');
      });
    }).catch(() => {
      reject('1 Cannot connect to API');
    });
  });
}

const getAllUsers = (page) => {
  return new Promise((fufill, reject) => {
    getApiToken().then((token) => {
      const options = {
        method: 'GET',
        url: `http://${apiconf.get('address')}:${apiconf.get('port')}/api/users/${page}`,
        headers: {
          authorization: `${token}`,
        }
      };
      
      request(options).then((body) => {
        if(body === '-1') {
          reject('-1 Bad query.');
        } else {
          try {
            response = JSON.parse(body);
            fufill(response);
          } catch(e) {
            reject('-2 Internal JSON parse error');
          }
        }
      }).catch((err) => {
        reject('2 Bad API Auth');
      });
    }).catch((err) => {
      reject('1 Cannot connect to API');
    });
  });
}

const getLatestMatches = () => {
  return new Promise((fufill, reject) => {
    getApiToken().then((token) => {
      const options = {
        method: 'GET',
        url: `http://${apiconf.get('address')}:${apiconf.get('port')}/matches/`,
        headers: {
          authorization: `${token}`,
        }
      };
      
      request(options).then((body) => {
        if(body === '-1') {
          reject('-1 Bad query.');
        } else {
          try {
            response = JSON.parse(body);
            fufill(response);
          } catch(e) {
            reject('-2 Internal JSON parse error');
          }
        }
      }).catch((err) => {
        reject('2 Bad API Auth');
      });
    }).catch((err) => {
      reject('1 Cannot connect to API');
    });
  });
}

const getTop = () => {
  return new Promise((fufill, reject) => {
    getApiToken().then((token) => {
      const options = {
        method: 'GET',
        url: `http://${apiconf.get('address')}:${apiconf.get('port')}/api/top10/`,
        headers: {
          authorization: `${token}`,
        }
      };
      
      request(options).then((body) => {
        if(body === '-1') {
          reject('-1 Bad query.');
        } else {
          try {
            response = JSON.parse(body);
            fufill(response);
          } catch(e) {
            reject('-2 Internal JSON parse error');
          }
        }
      }).catch((err) => {
        reject('2 Bad API Auth');
      });
    }).catch((err) => {
      reject('1 Cannot connect to API');
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
    returnURL: `http://localhost:3000/auth/steam/return`,
    realm: `http://localhost:3000/`,
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
  getLatestMatches().then((output) => {
    res.render('home', {
      page: `${config.get('appname')} | Home`,
      matches: output,
      user: req.user || undefined,
    });
  }).catch((err) => {
    res.render('home', {
      page: `${config.get('appname')} | Home`,
      matches: undefined,
      user: req.user || undefined,
    });
  });
});

app.get('/login/', (req, res) => {
  res.render('login', {
    page: `${config.get('appname')} | Login`,
  });
});

// GET /logout
//  Ends the session with the user and clears
//  req.user
app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

// GET /users/:pg
//  A list of 100 users will be displayed
app.get('/users/:pg', (req, res) => {
  getAllUsers(req.params.pg).then((output) => {
    res.render('users', {
      page: `${config.get('appname')} | Users`,
      user: req.user || undefined,
      users: output,
    });
  }).catch((err) => {
    res.render('error', {
      page: `${config.get('appname')} | Error`,
      user: req.user || undefined,
      code: 500,
      error: err,
    });
  });
});

// GET /user/me/
//  The profile of the logged in user
//  req.user
app.get('/user/me/', ensureAuthenticated, (req, res) => {
  getUserProfile(req.user.id).then((output) => {
    res.render('user', {
      page: `${config.get('appname')} | ${req.user.displayName}`,
      user: req.user,
      dbuser: output.user,
      player: output.player,
      matches: output.matches,
    });
  }).catch((err) => {
    res.render('error', {
      page: `${config.get('appname')} | Error`,
      user: req.user || undefined,
      code: 500,
      error: err,
    });
  });
});

// GET /user/:steamid
//  Will locate the profile of the corresponding user
//  with parameter :steamid
app.get('/user/:steamid', (req, res) => {
  getUserProfile(req.params.steamid).then((output) => {
    res.render('user', {
      page: `${config.get('appname')} | ${output.user.alias || 'Not Found'}`,
      user: req.user || undefined,
      dbuser: output.user,
      player: output.player,
      matches: output.matches,
    });
  }).catch((err) => {
    res.render('error', {
      page: `${config.get('appname')} | Error`,
      user: req.user || undefined,
      code: 500,
      error: err,
    });
  });
});

// GET /top10/
//  Will display the top 10 players in the db
app.get('/top10/', (req, res) => {
  getTop().then((output) => {
    res.render('top', {
      page: `${config.get('appname')} | Top 10 Players`,
      user: req.user || undefined,
      players: output,
    });
  }).catch((err) => {
    res.render('error', {
      page: `${config.get('appname')} | Error`,
      user: req.user || undefined,
      code: 500,
      error: err,
    });
  });
});

// GET /matches/:steamid
//  Will display all matches played by the player
//  specified by :steamid
app.get('/matches/:steamid', (req, res) => {
  getUserMatches().then((output) => {
    res.render('match', {
      page: `${config.get('appname')} | User Matches`,
      user: req.user || undefined,
      matches: output,
    });
  }).catch((err) => {
    res.render('error', {
      page: `${config.get('appname')} | Error`,
      user: req.user || undefined,
      code: 500,
      error: err,
    });
  });
});

// GET /link/
//  Sends a POST request to /api/user/
//  which will add the user to the DB
app.get('/link/', ensureAuthenticated, (req, res) => {
  getApiToken().then((token) => {
    const options = {
      method: 'POST',
      url: `http://${apiconf.get('address')}:${apiconf.get('port')}/api/user/`,
      json: true,
      headers: {
        authorization: `${token}`,
      },
      body: {
        alias: req.user.displayName,
        steamid: req.user.id,
        avatars: req.user.photos,
      },
    };
    
    request(options).then((output) => {
      if(output === '-1') {
        res.render('error', {
          page: `${config.get('appname')} | Error`,
          user: req.user || undefined,
          code: 500,
          error: '-1 Query error',
        });
      } else {
        res.redirect('/user/me/');
      }
    }).catch((err) => {
      res.render('error', {
        page: `${config.get('appname')} | Error`,
        user: req.user || undefined,
        code: 500,
        error: err,
      });
    });
  }).catch((err) => {
    res.render('error', {
      page: `${config.get('appname')} | Error`,
      user: req.user || undefined,
      code: 500,
      error: err,
    });
  });
});

//
// END MAIN ROUTES
//

// GET /auth/steam
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Steam authentication will involve redirecting
//   the user to steamcommunity.com.  After authenticating, Steam will redirect the
//   user back to this application at /auth/steam/return
app.get('/auth/steam', passport.authenticate('steam', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/link/');
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
    res.redirect('/link/');
});


app.listen(3000, () => {
  logger.log('info', 'App started.');
});
