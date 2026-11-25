### Controllers

Controllers are responsible for handling incoming **requests** and sending **responses** back to the client.

A controller's purpose is to handle specific requests for the application. The **routing** mechanism determines which controller handles each request. A controller often has multiple routes, and each route can perform a different action.

To create a basic controller, you use classes and **decorators**. Decorators associate classes with the required metadata, which Nest uses to build a routing map that connects requests to their corresponding controllers.

#### Library-specific responses

For compatibility with typings across underlying HTTP platforms (e.g., Express and Fastify), Nest provides the `@Res()` and `@Response()` decorators. `@Res()` is an alias for `@Response()`. Both directly expose the native `response` object of the underlying platform. When using them, also install the typings for the underlying library (e.g., `@types/express`) to take full advantage of them. When you inject either `@Res()` or `@Response()` in a route handler, you put Nest into **library-specific mode** for that handler, and you become responsible for managing the response. You must then send a response by calling a method on the `response` object (e.g., `res.json(...)` or `res.send(...)`); otherwise, the request will hang.

#### Route parameters

Routes with static paths don't work when you need to accept **dynamic data** as part of the request (e.g., `GET /cats/1` to get the cat with id `1`). To define a route with parameters, add route parameter **tokens** to the route path to capture the dynamic values from the URL, as the `@Get()` decorator in the example below shows. You can then access these route parameters with the `@Param()` decorator, added to the method signature.
