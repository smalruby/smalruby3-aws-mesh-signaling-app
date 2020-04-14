const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

exports.handler = async event => {
    try {
        const deleteParams = {
            TableName: process.env.TABLE_NAME,
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
