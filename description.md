### Save data from client on a flaky HTTP server

Server:

The server is a simple Node JS HTTP POST endpoint (without using express js or any other framework) which accepts a JSON input consisting of some user information in the below format:

Example Input:

```js
{
    "user_id": 1,
    "name": "Jane Doe",
    "email": "jane@example.com"
}
```

and saves it in a JSON file in a `data` directory with the file name as `${user_id}.json`.

If the file corresponding to the user information is already present before it is saved, the server exits with an exit code of 1.

If the file corresponding to the user_id is not present, the file is be saved and the server returns a HTTP 200 status code.

The server is also flaky. When a new user is attempted to be added, 50% of the time, it does not save the data and returns a 500 status code.

(Feel free to read the server code)

---

Client:

Build a JavaScript client which stores each user's information present in `data.js` into the server by making POST requests to the server.

The client must be reliable:

The client must ensure that each user's information is stored only once in the server.

Since the server is flaky, it might not save the data and return a 500 error randomly. So, the client must be resilient and ensure the data is saved when such errors happen.
