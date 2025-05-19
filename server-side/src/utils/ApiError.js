class ApiError extends Error
{
    constructor(statusCode,message,errors){
        super(message);
        this.message=message,
        this.statusCode=statusCode,
        this.errors=errors
    }
}

export {
    ApiError
}