const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const { TABLE_NAME } = process.env;

exports.handler = async event => {
    try {
        const deleteParams = {
            TableName: TABLE_NAME,
            Key: {
                connectionId: event.requestContext.connectionId
            }
        };
        await ddb.delete(deleteParams).promise();

        return { statusCode: 200, body: 'Disconnected.' };
    } catch (err) {
        return { statusCode: 500, body: 'Failed to disconnect: ' + JSON.stringify(err) };
    }
};
