#for file in *.jar; do
#  echo $file
#done
trap "echo Received stop signal; pkill java" INT TERM EXIT
ls -la
file=$(ls *.jar | tail -1)
echo Starting $file
mkdir -p $MC_SERVER
cd $MC_SERVER
java -jar ../$file
echo Stopped!
