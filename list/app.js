const AWS = require('aws-sdk');

const TTL_SECONDS = 5 * 60;
const { TABLE_NAME, AWS_REGION } = process.env;

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: AWS_REGION });

exports.handler = async event => {
    try {
        const connectionId = event.requestContext.connectionId;
        const sourceIp = event.requestContext.identity.sourceIp;

        let domainName = event.requestContext.domainName;
        if (event.requestContext.apiId) {
            domainName = `${event.requestContext.apiId}.execute-api.${AWS_REGION}.amazonaws.com`;
        }
        const apigwManagementApi = new AWS.ApiGatewayManagementApi({
            apiVersion: '2018-11-29',
            endpoint: domainName + '/' + event.requestContext.stage
        });

        const response = {
            action: 'list',
            result: false,
            data: {}
        };

        try {
            const postData = JSON.parse(event.body).data;

            const meshId = postData.meshId;
            // TODO: validate meshId
            response.data.meshId = meshId;

            const queryParams = {
                TableName: TABLE_NAME,
                IndexName: 'sourceIp-isHost-index',
                KeyConditionExpression: 'sourceIp = :sourceIp and isHost = :isHost',
                ProjectionExpression: 'meshId, #ttl',
                ExpressionAttributeNames: {
                    '#ttl': 'ttl'
                },
                ExpressionAttributeValues: {
                    ':sourceIp': sourceIp,
                    ':isHost': 1
                }
            };
            const hostsData = await ddb.query(queryParams).promise();
            response.data.hosts = hostsData.Items.sort((a, b) => {
                return b.ttl - a.ttl;
            });

            response.result = true;

            await apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify(response)
            }).promise();

            return { statusCode: 200, body: 'Listed.' };
        }
        catch (err){
            response.data.error = JSON.stringify(err);

            await apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify(response)
            }).promise();

            throw err;
        }
    } catch (err) {
        return { statusCode: 500, body: 'Failed to list: ' + JSON.stringify(err) };
    }
};
