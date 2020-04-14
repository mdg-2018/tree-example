/** This sample code demonstrates how to take the output of a MongoDB graph lookup query and organized the data
 * into a tree structure. This is especially useful for creating an organizational hierarchy visualization.
 */

//configuration - change these!
const uri = "";
const dbname = "";

//establish connection to MongoDB
const mongoClient = require('mongodb').MongoClient;
mongoClient.connect(uri, function (err, client) {
  if (err) {
    console.log(err);
  }

  var collection = client.db('fm-graph').collection('employees');

  //Aggregation pipeline runs graph lookup to find all employees who report (directly or indirectly) to Dev
  var pipeline = [
    {
      '$match': {
        'name': 'Dev'
      }
    }, {
      '$graphLookup': {
        'from': 'employees',
        'startWith': '$name',
        'connectFromField': 'name',
        'connectToField': 'reportsTo',
        'as': 'reports',
        'depthField': 'depth'
      }
    }, {
      '$addFields': {
        'maxDepth': {
          '$max': '$reports.depth'
        }
      }
    }
  ];

  collection.aggregate(pipeline, (err, result) => {
    result.toArray().then((data) => {
      console.log(data[0]);

      //send result set into "organizeReports function"
      var organizedData = organizeReports(data[0]);

      //write formatted data back to database
      client.db(dbname).collection('results').deleteMany({}).then(() => {
        client.db(dbname).collection('results').insertOne(organizedData).then(() => {
          process.exit();
        });
      })

    })
  })
});

function organizeReports(hierarchy) {

  //determine max depth
  var maxDepth = hierarchy.maxDepth;
  console.log(maxDepth);

  //loop through different levels of depth - this allows us to "roll up" reports at each level until we get to the top of the hierarchy
  var reports = hierarchy.reports;
  for (i = maxDepth; i > 0; i--) {
    // call rollUp function for each level of depth
    reports = rollUp(reports, i);
  }

  hierarchy.reports = reports;

  return hierarchy;

}

function rollUp(reports, depth) {

  console.log("\nrolling up for depth " + depth);
  console.log("-------------------")

  var result = [];
  var filterItems = []; // after an item has been rolled up (essentially becoming a child of another object) it can be filtered out of the result set

  reports.forEach((report) => {
    reports.forEach((rpt) => {
      //check each item against every other item to determine place in hierarchy
      if (rpt.depth == depth && report.name == rpt.reportsTo) {
        if (report.reports == null) {
          report.reports = [];
        }
        //roll up child object into parent object
        report.reports.push(rpt);
        //add child element to list of filters so it doesn't get processed twice
        filterItems.push(rpt._id);
      }
    })
    // add modified parent object to result set
    result.push(report);
  })

  // filter out items that had already been rolled up into parent object
  result = result.filter((employee) => {
    var keep = true;
    filterItems.forEach((filterItem) => {
      if (employee._id == filterItem) {
        keep = false;
      }
    })

    return keep;
  })

  // send back result for given depth
  return result;
}

