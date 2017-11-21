const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const config = require('config');
const jwt = require('express-jwt');
const jwks = require('jwks-rsa');
const winston = require('winston');
const steamuserinfo = require('steam-userinfo');

const app = express();


steamuserinfo.setup(config.get('steam.apikey'));


const logger = new(winston.Logger)({
  transports: [
    new winston.transports.Console({ level: 'info' }),
    new winston.transports.File({
      level: 'info',
      filename: './logs/combined.log',
    }),
  ],
});


const dbconf = config.get('database');
const authconf = config.get('auth');


const jwtCheck = jwt({
  secret: jwks.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 100,
      jwksUri: authconf.get('jwksuri'),
  }),
  audience: authconf.get('audience'),
  issuer: authconf.get('issuer'),
  algorithms: ['RS256'],
});

if (process.env.NODE_ENV !== 'test') { // disabe authentication during testing
  app.use(jwtCheck);
}


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


const con = mysql.createConnection({
  host: dbconf.get('address'),
  user: dbconf.get('user'),
  password: dbconf.get('pass'),
  database: dbconf.get('db'),
});

// GET /api/authorized/
//  A check to see if the API can be accessed
app.get('/api/authorized/', (req, res) => {
  logger.log('info', 'GET /api/authorized/');

  res.send('AUTHORIZED');
});

// GET /api/users/:pg
//  Will get the user with the corresponding
//  steamid from the database
app.get('/api/users/:pg', (req, res) => { // POTENTIALLY UNSAFE!!!
  logger.log('info', `GET /api/users/${req.params.pg}`);

  const offset = parseInt(req.params.pg)*100;
  const query = `SELECT * FROM mgemod_stats ORDER BY name LIMIT 100 OFFSET ${offset}`;  
  con.query(query, (err, results) => {
    if (err) {
      logger.log('error', err);
      res.send('-1');
    } else {
      for(var i = 0; i < results.length; i++) {
        steamuserinfo.getUserInfo(results[i].steamid, (err, data) => {
          if(err) {
            logger.log('error', err);
            res.send('-3');
          } else {
            results[i].info = data.response[0];
          }
        });
      }
      res.send(results);
    }
  });
});

// GET /api/user/:steamid
//  Will get the user with the corresponding
//  steamid from the database
app.get('/api/user/:steamid', (req, res) => {
  logger.log('info', `GET /api/user/${req.params.steamid}`);

  var user = {};

  const query = `SELECT * FROM mgemod_stats WHERE steamid = ${mysql.escape(req.params.steamid)}`;
  con.query(query, (err, results) => {
    if (err) {
      logger.log('error', err);
      res.send('-1');
    } else {
      user.user = results[0];

      const query2 = `SELECT * FROM mgemod_duels
                      WHERE winner = ${mysql.escape(req.params.steamid)}
                      OR loser = ${mysql.escape(req.params.steamid)}`;
      con.query(query2, (err, results2) => {
        if (err) {
          logger.log('error', err);
          res.send('-1');
        } else {
          user.matches = results2[0];
          steamuserinfo.getUserInfo(user.user.steamid, (err, data) => {
            if(err) {
              logger.log('error', err);
              res.send('-3');
            } else {
              user.info = data.response[0];
              res.send(user);
            }
          });
        }
      });
    }
  });
});

// GET /api/matches/
//  Lists past 100 matches
app.get('/api/matches/', (req, res) => { // get aliases used?
  logger.log('info', 'GET /api/matches/');

  const query = `SELECT * FROM mgemod_duels ORDER BY id DESC LIMIT 100`;
  con.query(query, (err, results) => {
    if (err) {
      logger.log('error', err);
      res.send('-1');
    } else {
      res.send(results);
    }
  });
});

// GET /api/matches/:steamid
//  Lists past 100 matches
app.get('/api/matches/:steamid', (req, res) => { // get aliases used?
  logger.log('info', `GET /api/matches/${req.params.steamid}`);

  const query = `SELECT * FROM mgemod_duels
                WHERE winner = ${mysql.escape(req.params.steamid)}
                OR loser = ${mysql.escape(req.params.steamid)}
                ORDER BY id DESC LIMIT 100`;
  con.query(query, (err, results) => {
    if (err) {
      logger.log('error', err);
      res.send('-1');
    } else {
      res.send(results);
    }
  });
});


// GET /api/top10/
//  Lists top 10 users
app.get('/api/top10/', (req, res) => {
  logger.log('info', `GET /api/top10/`);

  const query = `SELECT * FROM mgemod_stats ORDER BY rating DESC LIMIT 10`;
  con.query(query, (err, results) => {
    if (err) {
      logger.log('error', err);
      res.send('-1');
    } else {
      res.send(results);
    }
  });
});

// POST /api/user/
//  Updates/adds user to db
//  DEPRECATED
app.post('/api/user/', (req, res) => {
  logger.log('info', 'POST /api/user');

  const alias = req.body.alias;
  const steamid = req.body.steamid;
  const avatar_sm = req.body.avatars[0].value;
  const avatar_m = req.body.avatars[1].value;
  const avatar_lg = req.body.avatars[2].value;

  const query = `INSERT INTO users (alias, steamid, avatar_sm, avatar_m, avatar_lg)
                VALUES ( ${mysql.escape(alias)}, ${mysql.escape(steamid)},
                ${mysql.escape(avatar_sm)}, ${mysql.escape(avatar_m)}, ${mysql.escape(avatar_lg)})
                ON DUPLICATE KEY UPDATE avatar_sm=${mysql.escape(avatar_sm)},
                avatar_m=${mysql.escape(avatar_m)},
                avatar_lg=${mysql.escape(avatar_lg)}`;

  con.query(query, (err, result) => {
    if (err) {
      logger.log('error', err);
      res.send('-1');
    } else {
      res.send('0');
    }
  });
});

// POST /api/users/search/
//  Searches for similar usernames in db
app.post('/api/users/search/', (req, res) => {
  logger.log('info', 'POST /api/users/search/');

  const search = `%${req.body.query}%`;
  const sortby = req.body.sortby;

  var query = `SELECT * FROM mgemod_stats
              WHERE name LIKE ${mysql.escape(search)}`;

  con.query(query, (err, result) => {
    if (err) {
      logger.log('error', err);
      res.send('-1');
    } else {
      res.send(result);
    }
  });
});


app.listen(8080, () => {
  con.connect((err) => {
    if (err) {
      logger.log('error', 'Could not connect to database. Exiting');
      throw (err);
    } else {
      logger.log('info', 'Connected to database, API started');
    }
  });
});
