trap "echo Received stop signal; pkill java" INT TERM EXIT
ls -la
file=$(ls waterfall*.jar | tail -1)
echo Starting $file
mkdir -p proxy
cd proxy
java -jar ../$file
echo Stopped!
