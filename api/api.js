const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const config = require('config');
const jwt = require('express-jwt');
const jwks = require('jwks-rsa');
const winston = require('winston');

const app = express();


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

if (process.env.NODE_ENV !== 'production') { // disabe authentication during testing
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

// GET /api/user/:steamid
//  Will get the user with the corresponding
//  steamid from the database
app.get('/api/user/:steamid', (req, res) => {
  logger.log('info', 'GET /api/user/:steamid');

  var user = {};
  
  const query = `SELECT * FROM users WHERE steamid = ${mysql.escape(req.params.steamid)}`;
  
  con.query(query, (err, results) => {
    if (err) {
      logger.log('error', err);
      res.send('-1');
    } else {
      user.user = results
      const query2 = `SELECT * FROM mgemod_duels
                    WHERE winner = ${mysql.escape(req.params.steamid)}
                    OR loser = ${mysql.escape(req.params.steamid)}`;
      
      con.query(query2, (err, results2) => {
        if (err) {
          logger.log('error', err);
          res.send('-1');
        } else {
          user.matches = results2;
          res.send(user);
          // res.send(JSON.stringify(user));
        }
      });
    }
  });
});

// GET /api/matches/
//  Lists past 100 matches
app.get('/api/matches', (req, res) => {
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
app.get('/api/matches/:steamid', (req, res) => {
  logger.log('info', 'GET /api/matches/:steamid');

  const query = `SELECT * FROM mgemod_duels
                WHERE winner = ${mysql.escape(req.params.steamid)}
                OR loser = ${mysql.escape(req.params.steamid)}`;
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
app.post('/api/user/', (req, res) => {
  logger.log('info', 'POST /api/user');

  const alias = req.body.alias;
  const steamid = req.body.steamid;
  const avatar = req.body.avatar;

  const query = `INSERT INTO users (alias, steamid, avatar)
                VALUES ( ${mysql.escape(alias)}, ${mysql.escape(steamid)}, ${mysql.escape(avatar)})
                ON DUPLICATE KEY UPDATE alias=${mysql.escape(alias)}, avatar=${mysql.escape(avatar)}`;

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

  var query = `SELECT * FROM users
              WHERE alias LIKE ${mysql.escape(search)}`;

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
